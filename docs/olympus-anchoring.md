# Olympus ledger anchoring

TiM anchors three record types to an [Olympus](https://github.com/OlympusLedgerOrg/Olympus)
node so that a movement, lab report, or sign-off can be proven — to an auditor,
a customer, or a court — to have existed at a given time with given content:

| Record type   | Written by                            |
|---------------|---------------------------------------|
| `MOVEMENT`    | `POST /api/v1/movements`              |
| `LAB_REPORT`  | `POST /api/v1/lab-reports`            |
| `SIGNOFF`     | `POST /api/v1/lab-reports/:id/signoff`|

Anchoring is **optional**. With `OLYMPUS_URL` empty, nothing is enqueued, the
drainer does not start, and TiM behaves exactly as it did before.

## How it works

Anchoring is a transactional outbox, not a direct call.

1. **Enqueue.** The service writes an `OlympusCommit` row in the *same database
   transaction* as the domain record. Either both land or neither does.
2. **Drain.** A background worker claims due rows, serializes each into an
   anchor document, and uploads it to Olympus.
3. **Stamp.** On success the row is marked `COMMITTED` and the ledger's
   `proof_id` is written back to the domain record's `olympusCommitId`.

The request path never waits on Olympus, so a slow or unreachable node cannot
slow down or fail a technician's action.

### Why an outbox

The previous implementation issued an un-awaited HTTP call after the record was
written, and returned `null` on every failure path. A restart, a network blip,
or an Olympus outage in that window dropped the anchor with nothing recorded
anywhere. For records whose entire purpose is later provability, a silently
missing anchor is the worst available outcome.

With the outbox, a failure is durable and visible: the row stays in the table
with its `lastError` and `attempts`, and is retried.

### Why the document is uploaded as a file

Olympus has no "client asserts a hash" ingest route — the JSON attestation path
was removed under its audit finding H-5, because the ledger would otherwise
commit to a digest whose preimage the server never saw. The supported route is
`POST /ingest/files`, where the server hashes the bytes it receives.

So TiM serializes the anchor document and uploads it. The bytes are the
evidence; `content_hash` in the response is BLAKE3 over exactly those bytes.

Anchor document shape:

```json
{
  "schema": "tim.olympus.anchor/v1",
  "type": "MOVEMENT",
  "tenantId": "...",
  "recordId": "...",
  "data": { "...": "record-specific fields" }
}
```

Object keys are sorted recursively so the same logical record always produces
the same bytes. This is key-ordering determinism only — it is deliberately not
Olympus's own canonical-JSON profile, which additionally applies NFC
normalization and exact-decimal number rules. That profile governs Olympus's
internal digests; these bytes are hashed raw as an opaque file.

The ledger-side record identity is `tim:{tenantId}:{TYPE}:{recordId}`.

## Operator setup

1. Set `OLYMPUS_URL` and `OLYMPUS_API_KEY`. The key needs the `write`,
   `ingest`, or `admin` scope on the Olympus side.
2. **Register the shard before enabling anchoring.** Shard creation in Olympus
   is operator-controlled: writing to a `shard_id` that is absent or inactive in
   its registry is rejected `403`. Either use the default `files` shard that
   Olympus seeds, or register a dedicated one via its admin API
   (`POST /admin/shards`) and set `OLYMPUS_SHARD_ID` to match.
3. Apply the migration: `npx prisma migrate deploy`.

All tuning knobs and their defaults are documented in `.env.example`.

### Running multiple instances

Safe. Rows are claimed with `FOR UPDATE SKIP LOCKED`, so each row goes to
exactly one worker. Claiming also pushes `nextAttemptAt` out by the visibility
timeout, so a worker that dies mid-request does not strand its row — the row
simply becomes due again.

## Failure handling

| Response | Treated as | Rationale |
|---|---|---|
| `409` | permanent | Olympus's ledger is insert-only; this identity is committed with different content. Retrying cannot resolve it. |
| `400`, `413`, `422` | permanent | Malformed or oversized request. |
| `401`, `403` | retryable | Usually a rotated key or an unregistered shard — an operator fixes it while rows wait. |
| `429`, `5xx` | retryable | Load or outage. |
| network / timeout | retryable | Transient by nature. |
| `2xx` without `proof_id` | retryable | Cannot record what was anchored, so the row is not marked committed. |

Retries use exponential backoff with jitter, capped at one hour. After
`OLYMPUS_OUTBOX_MAX_ATTEMPTS` retryable attempts — or immediately on a permanent
failure — the row is parked as `DEAD_LETTER` and logged at `error` level with
the message `Anchor dead-lettered — this record is NOT on the ledger`.

Dead-lettering is a park, not a delete: the row keeps its payload and
`lastError`. Requeue after fixing the cause with

```sql
UPDATE "OlympusCommit"
   SET status = 'PENDING', attempts = 0, "nextAttemptAt" = NOW()
 WHERE status = 'DEAD_LETTER' AND id = $1;
```

## Testing

Most of the suite mocks Prisma. The drainer's claim statement is raw SQL, so it
additionally has database-backed tests in
`backend/tests/olympusOutbox.integration.test.ts` — they cover `FOR UPDATE SKIP
LOCKED`, the enum casts, `make_interval`, and that a rolled-back transaction
leaves no outbox row.

They run whenever `DATABASE_URL` is set, and print a notice to stderr when it is
not, so a run without database coverage is never mistaken for a clean one. To
run them locally against a throwaway database:

```bash
export DATABASE_URL=postgresql://tim:tim@localhost:5432/tim_test
cd backend
npx prisma db push --skip-generate --accept-data-loss
npm test
```

`db push` rather than `migrate deploy`: the committed migrations are incremental
`ALTER`s over a baseline that was never captured as a migration, so they cannot
build a database from empty.

### What to monitor

```sql
SELECT status, count(*) FROM "OlympusCommit" GROUP BY status;
```

Any `DEAD_LETTER` row means a record that is **not** on the ledger. A growing
`PENDING` count with rising `attempts` means Olympus is unreachable.
