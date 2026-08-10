/**
 * Socket.IO cross-instance fan-out.
 *
 * ## The problem this solves
 *
 * Socket.IO's default adapter keeps rooms in process memory. With more than one
 * backend instance behind a load balancer, `io.to('work-order:123').emit(...)`
 * only reaches the clients connected to *that* instance — a technician on
 * instance A never sees a step completed through instance B. Real-time updates
 * are the product's headline feature, so this breaks first and silently the
 * moment the service is scaled or rolled.
 *
 * ## Why Postgres rather than Redis
 *
 * The Redis adapter is the more common choice, but it means running, securing,
 * and keeping Redis available at every site. TiM already requires PostgreSQL,
 * and `@socket.io/postgres-adapter` fans out over `LISTEN`/`NOTIFY` on that
 * same database — no new service to deploy on a plant floor. Its throughput
 * ceiling is lower than Redis's, and far above what work-order traffic reaches.
 *
 * Payloads above the 8000-byte `NOTIFY` limit (and binary ones) spill through
 * the `socket_io_attachments` table, created by migration.
 */

import type { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/postgres-adapter';
import pg from 'pg';
import { logger } from '../services/logger.js';

export interface SocketAdapter {
  /** Closes the adapter's dedicated connection pool. */
  close: () => Promise<void>;
}

/** `memory` forces the in-process default — single-instance deployments only. */
function adapterMode(): 'postgres' | 'memory' {
  const configured = (process.env.SOCKET_IO_ADAPTER ?? '').trim().toLowerCase();
  if (configured === 'memory') return 'memory';
  if (configured === 'postgres') return 'postgres';
  // Unset: use Postgres whenever a database is configured. Correct for one
  // instance as well as many, so scaling out needs no configuration change.
  return process.env.DATABASE_URL ? 'postgres' : 'memory';
}

/**
 * Attaches the cross-instance adapter to `io`.
 *
 * Returns `undefined` when running on the in-memory adapter, which is only
 * safe for a single instance.
 */
export function attachSocketAdapter(io: SocketIOServer): SocketAdapter | undefined {
  const mode = adapterMode();

  if (mode === 'memory') {
    logger.warn(
      { adapter: 'memory' },
      '[Socket.IO] Using the in-memory adapter — events do NOT cross backend instances. ' +
        'Safe for a single instance only.',
    );
    return undefined;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // Only reachable via an explicit SOCKET_IO_ADAPTER=postgres with no
    // database configured. Fail loudly rather than silently degrading to a
    // memory adapter the operator did not ask for.
    throw new Error(
      'SOCKET_IO_ADAPTER=postgres requires DATABASE_URL to be set.',
    );
  }

  // A dedicated pool: the adapter holds a long-lived LISTEN connection, which
  // must not sit inside Prisma's query pool competing with request traffic.
  const pool = new pg.Pool({
    connectionString,
    max: Number(process.env.SOCKET_IO_ADAPTER_POOL_MAX ?? 4),
  });

  // The pool emits 'error' for idle-client failures. Without a handler Node
  // treats it as an unhandled 'error' event and crashes the process.
  pool.on('error', (err) => {
    logger.error({ err }, '[Socket.IO] Postgres adapter pool error');
  });

  io.adapter(createAdapter(pool));
  logger.info({ adapter: 'postgres' }, '[Socket.IO] Cross-instance adapter attached');

  return {
    async close() {
      await pool.end();
      logger.info('[Socket.IO] Postgres adapter pool closed');
    },
  };
}
