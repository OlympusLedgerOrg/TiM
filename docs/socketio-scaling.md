# Running more than one backend instance

TiM's real-time updates (`stepCompleted`, `queueUpdated`, equipment events) are
delivered through Socket.IO rooms. Socket.IO's default adapter keeps those rooms
in **process memory**, which means a single instance is the only supported
topology unless a cross-instance adapter is attached.

## What went wrong without it

With two instances behind a load balancer:

- A technician's browser connects to instance **A** and joins `work-order:123`.
- A supervisor completes a step; that request lands on instance **B**.
- `io.to('work-order:123').emit('stepCompleted', …)` runs on **B**, where the
  room is empty — instance B has never heard of that socket.
- The technician's screen never updates. No error is raised anywhere.

The failure is silent and load-balancer dependent, so it presents as "the live
updates are flaky" rather than as an outage.

## What is configured now

`backend/src/sockets/adapter.ts` attaches
[`@socket.io/postgres-adapter`](https://socket.io/docs/v4/postgres-adapter/),
which relays broadcasts between instances over PostgreSQL `LISTEN`/`NOTIFY`.

Postgres rather than Redis deliberately: TiM already requires PostgreSQL, and
Redis would be another service to deploy, secure, and keep available at each
site. The Redis adapter has a higher throughput ceiling, far above what
work-order traffic reaches.

| Variable | Default | Meaning |
|---|---|---|
| `SOCKET_IO_ADAPTER` | `postgres` when `DATABASE_URL` is set, else `memory` | `memory` forces the in-process adapter — single instance only |
| `SOCKET_IO_ADAPTER_POOL_MAX` | `4` | Connections in the adapter's own pool |

The adapter uses a **dedicated** connection pool, not Prisma's: it holds a
long-lived `LISTEN` connection that must not compete with request traffic.

Choosing `memory` logs a warning at startup naming the consequence, so the
single-instance constraint is never silently in force.

### The attachments table

`NOTIFY` caps a payload at 8000 bytes. Larger or binary payloads spill through
the `socket_io_attachments` table, created by migration
`20260810_add_socket_io_attachments`. The adapter owns those rows at runtime; it
is modelled in `schema.prisma` only so `prisma db push` and `migrate` create it
and the schema does not report drift.

If that table is missing, ordinary emits keep working and only large ones fail —
a failure mode that hides until production, which is why there is a test for it.

## Still single-instance

Rate limiting. `express-rate-limit` is configured with its default in-memory
store, so each instance counts separately: with N instances the effective limit
is N× the configured value, and counters reset on deploy. That matters most for
`authLimiter` (10/min), which exists to slow brute-force attempts. Moving it to
a shared store is follow-up work.

## Testing

`backend/tests/socketAdapter.integration.test.ts` starts two real Socket.IO
servers, connects a client to each, and asserts an emit on one reaches the
client on the other — including an oversized payload that exercises the
attachments table. It runs whenever `DATABASE_URL` is set and prints a notice to
stderr when it is not.

```bash
export DATABASE_URL=postgresql://tim:tim@localhost:5432/tim_test
cd backend
npx prisma db push --skip-generate --accept-data-loss
npm test
```

The test was verified to fail (by timeout) when the adapter is forced to
`memory`, so it proves the fan-out rather than restating the configuration.
