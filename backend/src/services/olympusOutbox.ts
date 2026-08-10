/**
 * Transactional outbox for Olympus ledger anchors.
 *
 * ## The problem this solves
 *
 * Anchoring used to be fire-and-forget: the service created the domain record,
 * then kicked off an un-awaited HTTP call whose every failure path returned
 * `null` and logged nothing durable. A restart, a network blip, or an Olympus
 * outage between those two steps silently dropped the anchor. For records whose
 * entire purpose is to be provable later — movements, lab reports, sign-offs —
 * a silently missing anchor is the worst possible failure, because nothing
 * anywhere reports it.
 *
 * ## The shape
 *
 * `enqueueOlympusCommit` writes a row in the SAME database transaction as the
 * domain record. Either both land or neither does. A background drainer then
 * claims due rows and submits them, retrying transient failures with
 * exponential backoff and parking unrecoverable ones in `DEAD_LETTER` where
 * they stay visible and requeueable.
 *
 * Claiming uses `FOR UPDATE SKIP LOCKED`, so running several backend instances
 * is safe: each row is claimed by exactly one worker.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client.js';
import { logger } from './logger.js';
import {
  isOlympusEnabled,
  submitToOlympus,
  type OlympusAnchor,
  type OlympusRecordType,
} from './olympusBridge.js';

/** Any Prisma client — the base client or a transaction client. */
type PrismaLike = Prisma.TransactionClient | typeof prisma;

/** Rows claimed per drainer tick. */
const DEFAULT_BATCH_SIZE = 10;

/** Delay between ticks when the queue came up empty. */
const DEFAULT_POLL_INTERVAL_MS = 10_000;

/**
 * How long a claimed row stays invisible to other workers.
 *
 * Must exceed the HTTP timeout in `olympusBridge`, otherwise a slow-but-alive
 * request could have its row re-claimed by a second worker and double-sent.
 */
const DEFAULT_VISIBILITY_TIMEOUT_MS = 120_000;

/** Retryable attempts before a row is parked in `DEAD_LETTER`. */
const DEFAULT_MAX_ATTEMPTS = 12;

const BACKOFF_BASE_MS = 5_000;
const BACKOFF_CAP_MS = 3_600_000;

function envInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Exponential backoff with full jitter on the upper half of the window.
 *
 * The jitter matters: when Olympus comes back after an outage, a large backlog
 * would otherwise retry in lockstep and stampede it.
 */
export function backoffMs(attempts: number): number {
  const window = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_CAP_MS);
  return Math.round(window / 2 + Math.random() * (window / 2));
}

/**
 * Records an anchor to be submitted to Olympus.
 *
 * MUST be called with `tx` bound to the same transaction that writes the domain
 * record — that atomicity is the entire point of the outbox.
 *
 * No-ops when Olympus is not configured, so deployments that do not anchor do
 * not accumulate rows that could never drain.
 *
 * Idempotent: a repeat enqueue for the same record is absorbed by the
 * `(recordType, recordId)` unique constraint rather than raising.
 */
export async function enqueueOlympusCommit(
  tx: PrismaLike,
  anchor: OlympusAnchor,
): Promise<void> {
  if (!isOlympusEnabled()) return;

  await tx.olympusCommit.upsert({
    where: {
      recordType_recordId: { recordType: anchor.type, recordId: anchor.recordId },
    },
    create: {
      tenantId: anchor.tenantId,
      recordType: anchor.type,
      recordId: anchor.recordId,
      payload: anchor.data as Prisma.InputJsonValue,
    },
    // Already queued or already committed — leave it exactly as it is.
    update: {},
  });
}

interface ClaimedRow {
  id: string;
  tenantId: string;
  recordType: OlympusRecordType;
  recordId: string;
  payload: Record<string, unknown>;
  attempts: number;
}

/**
 * Atomically claims up to `batchSize` due rows.
 *
 * `attempts` is incremented at claim time rather than on failure, so a worker
 * that dies mid-request still burns an attempt and a poison row cannot spin
 * forever. `nextAttemptAt` is pushed out by the visibility timeout, which is
 * what makes a crashed worker's row simply become due again.
 */
async function claimBatch(
  batchSize: number,
  visibilityTimeoutMs: number,
): Promise<ClaimedRow[]> {
  const visibilitySecs = Math.ceil(visibilityTimeoutMs / 1000);

  return prisma.$queryRaw<ClaimedRow[]>`
    UPDATE "OlympusCommit"
       SET attempts        = attempts + 1,
           "nextAttemptAt" = NOW() + make_interval(secs => ${visibilitySecs}::int),
           "updatedAt"     = NOW()
     WHERE id IN (
       SELECT id
         FROM "OlympusCommit"
        WHERE status = 'PENDING'::"OlympusCommitStatus"
          AND "nextAttemptAt" <= NOW()
        ORDER BY "nextAttemptAt" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id,
              "tenantId",
              "recordType"::text AS "recordType",
              "recordId",
              payload,
              attempts
  `;
}

/**
 * Mirrors the ledger `proof_id` back onto the domain record.
 *
 * The `olympusCommitId` columns predate the outbox and are surfaced by the
 * movement and lab-report APIs, so they stay populated.
 */
async function stampDomainRecord(
  tx: Prisma.TransactionClient,
  recordType: OlympusRecordType,
  recordId: string,
  proofId: string,
): Promise<void> {
  const data = { olympusCommitId: proofId };
  switch (recordType) {
    case 'MOVEMENT':
      await tx.movement.updateMany({ where: { id: recordId }, data });
      return;
    case 'LAB_REPORT':
      await tx.labReport.updateMany({ where: { id: recordId }, data });
      return;
    case 'SIGNOFF':
      await tx.signoff.updateMany({ where: { id: recordId }, data });
      return;
  }
}

export interface DrainResult {
  claimed: number;
  committed: number;
  retried: number;
  deadLettered: number;
}

export interface DrainOptions {
  batchSize?: number;
  visibilityTimeoutMs?: number;
  maxAttempts?: number;
}

/**
 * Runs one drain pass. Exported so tests can drive it deterministically without
 * waiting on the poll loop.
 */
export async function drainOnce(options: DrainOptions = {}): Promise<DrainResult> {
  const batchSize = options.batchSize ?? envInt('OLYMPUS_OUTBOX_BATCH_SIZE', DEFAULT_BATCH_SIZE);
  const visibilityTimeoutMs =
    options.visibilityTimeoutMs ??
    envInt('OLYMPUS_OUTBOX_VISIBILITY_MS', DEFAULT_VISIBILITY_TIMEOUT_MS);
  const maxAttempts =
    options.maxAttempts ?? envInt('OLYMPUS_OUTBOX_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS);

  const result: DrainResult = { claimed: 0, committed: 0, retried: 0, deadLettered: 0 };

  const rows = await claimBatch(batchSize, visibilityTimeoutMs);
  result.claimed = rows.length;

  for (const row of rows) {
    const anchor: OlympusAnchor = {
      type: row.recordType,
      tenantId: row.tenantId,
      recordId: row.recordId,
      data: row.payload ?? {},
    };

    const submission = await submitToOlympus(anchor);

    if (submission.outcome === 'committed') {
      // One transaction so a row is never marked COMMITTED without the domain
      // record being stamped, or the reverse.
      await prisma.$transaction(async (tx) => {
        await tx.olympusCommit.update({
          where: { id: row.id },
          data: {
            status: 'COMMITTED',
            proofId: submission.proofId,
            contentHash: submission.contentHash,
            lastError: null,
          },
        });
        await stampDomainRecord(tx, row.recordType, row.recordId, submission.proofId);
      });

      result.committed += 1;
      logger.info(
        {
          outboxId: row.id,
          recordType: row.recordType,
          recordId: row.recordId,
          proofId: submission.proofId,
          deduplicated: submission.deduplicated,
        },
        '[Olympus] Anchor committed',
      );
      continue;
    }

    const exhausted = submission.outcome === 'permanent' || row.attempts >= maxAttempts;

    if (exhausted) {
      await prisma.olympusCommit.update({
        where: { id: row.id },
        data: { status: 'DEAD_LETTER', lastError: submission.error },
      });
      result.deadLettered += 1;
      logger.error(
        {
          outboxId: row.id,
          recordType: row.recordType,
          recordId: row.recordId,
          attempts: row.attempts,
          reason: submission.outcome,
          error: submission.error,
        },
        '[Olympus] Anchor dead-lettered — this record is NOT on the ledger',
      );
      continue;
    }

    await prisma.olympusCommit.update({
      where: { id: row.id },
      data: {
        lastError: submission.error,
        nextAttemptAt: new Date(Date.now() + backoffMs(row.attempts)),
      },
    });
    result.retried += 1;
    logger.warn(
      {
        outboxId: row.id,
        recordType: row.recordType,
        recordId: row.recordId,
        attempts: row.attempts,
        error: submission.error,
      },
      '[Olympus] Anchor attempt failed — will retry',
    );
  }

  return result;
}

export interface OlympusDrainer {
  stop: () => Promise<void>;
}

/**
 * Starts the background drain loop.
 *
 * Returns a handle whose `stop()` awaits any in-flight pass, so graceful
 * shutdown never severs a submission midway and leaves a row invisible for the
 * whole visibility timeout.
 */
export function startOlympusDrainer(options: DrainOptions & { pollIntervalMs?: number } = {}): OlympusDrainer {
  const pollIntervalMs =
    options.pollIntervalMs ?? envInt('OLYMPUS_OUTBOX_POLL_MS', DEFAULT_POLL_INTERVAL_MS);
  const batchSize = options.batchSize ?? envInt('OLYMPUS_OUTBOX_BATCH_SIZE', DEFAULT_BATCH_SIZE);

  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<unknown> = Promise.resolve();

  const schedule = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(tick, delayMs);
    // Never hold the event loop open on the drainer's account.
    timer.unref();
  };

  const tick = () => {
    if (stopped) return;

    inFlight = (async () => {
      try {
        const drained = await drainOnce({ ...options, batchSize });
        // A full batch implies a backlog — keep going instead of idling.
        return drained.claimed >= batchSize ? 0 : pollIntervalMs;
      } catch (err) {
        logger.error({ err }, '[Olympus] Outbox drain pass failed');
        return pollIntervalMs;
      }
    })().then((delay) => {
      schedule(delay as number);
    });
  };

  logger.info({ pollIntervalMs, batchSize }, '[Olympus] Outbox drainer started');
  schedule(0);

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await inFlight.catch(() => undefined);
      logger.info('[Olympus] Outbox drainer stopped');
    },
  };
}
