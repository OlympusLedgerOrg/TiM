// Integration tests for the Olympus outbox against a REAL PostgreSQL.
//
// The unit tests in olympusOutbox.test.ts mock Prisma, so they never execute
// the drainer's raw claim SQL. Everything load-bearing about that statement —
// `FOR UPDATE SKIP LOCKED`, the `::"OlympusCommitStatus"` enum casts,
// `make_interval(secs => …)`, and the enqueue's atomicity with its surrounding
// transaction — can only be proven by running it.
//
// Requires DATABASE_URL and a database with the schema applied
// (`npx prisma db push`). When DATABASE_URL is unset the suite skips loudly
// rather than silently reporting success.

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  // Written straight to stderr, not console.warn: Jest suppresses console
  // output for a suite in which every test is skipped, which would make this
  // gap invisible — the exact failure mode the notice exists to prevent.
  process.stderr.write(
    '\n[integration] DATABASE_URL is not set — SKIPPING the Olympus outbox database tests.\n' +
      "[integration] The drainer's raw claim SQL is NOT covered by this run.\n\n",
  );
}

jest.mock('../src/services/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../src/services/olympusBridge', () => ({
  submitToOlympus: jest.fn(),
  isOlympusEnabled: jest.fn(() => true),
}));

import { prisma } from '../src/prisma/client';
import { submitToOlympus } from '../src/services/olympusBridge';
import { drainOnce, enqueueOlympusCommit } from '../src/services/olympusOutbox';

const mockSubmit = submitToOlympus as jest.Mock;

const committed = (proofId = 'proof-1') => ({
  outcome: 'committed' as const,
  proofId,
  contentHash: 'hash-1',
  deduplicated: false,
});

/** Inserts a PENDING row due now. */
async function seedRow(recordId: string, overrides: Record<string, unknown> = {}) {
  return prisma.olympusCommit.create({
    data: {
      tenantId: 'tenant-1',
      recordType: 'MOVEMENT',
      recordId,
      payload: { batchId: 'b-1' },
      ...overrides,
    },
  });
}

const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb('Olympus outbox against PostgreSQL', () => {
  beforeAll(async () => {
    // Fail loudly and early if the schema is missing, rather than surfacing as
    // a confusing per-test error.
    await prisma.$queryRaw`SELECT 1 FROM "OlympusCommit" LIMIT 1`;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSubmit.mockResolvedValue(committed());
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "OlympusCommit"');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('enqueue atomicity', () => {
    // The claim this whole design rests on.
    test('a rolled-back transaction leaves no outbox row', async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          await enqueueOlympusCommit(tx, {
            type: 'MOVEMENT',
            tenantId: 'tenant-1',
            recordId: 'mv-rollback',
            data: { batchId: 'b-1' },
          });
          throw new Error('domain write failed');
        }),
      ).rejects.toThrow('domain write failed');

      expect(await prisma.olympusCommit.count()).toBe(0);
    });

    test('a committed transaction persists the row', async () => {
      await prisma.$transaction(async (tx) => {
        await enqueueOlympusCommit(tx, {
          type: 'MOVEMENT',
          tenantId: 'tenant-1',
          recordId: 'mv-ok',
          data: { batchId: 'b-1' },
        });
      });

      const row = await prisma.olympusCommit.findFirstOrThrow();
      expect(row).toMatchObject({
        recordType: 'MOVEMENT',
        recordId: 'mv-ok',
        status: 'PENDING',
        attempts: 0,
      });
    });

    test('a second enqueue for the same record is absorbed by the unique index', async () => {
      const anchor = {
        type: 'LAB_REPORT' as const,
        tenantId: 'tenant-1',
        recordId: 'lr-1',
        data: { fileHash: 'abc' },
      };

      await enqueueOlympusCommit(prisma, anchor);
      await enqueueOlympusCommit(prisma, anchor);

      expect(await prisma.olympusCommit.count()).toBe(1);
    });
  });

  describe('claim SQL', () => {
    test('claims a due row, commits it, and persists the proof identifiers', async () => {
      await seedRow('mv-1');

      const result = await drainOnce();

      expect(result).toMatchObject({ claimed: 1, committed: 1 });
      const row = await prisma.olympusCommit.findFirstOrThrow();
      expect(row).toMatchObject({
        status: 'COMMITTED',
        proofId: 'proof-1',
        contentHash: 'hash-1',
        attempts: 1,
        lastError: null,
      });
    });

    test('does not claim a row scheduled in the future', async () => {
      await seedRow('mv-future', { nextAttemptAt: new Date(Date.now() + 60_000) });

      const result = await drainOnce();

      expect(result.claimed).toBe(0);
      expect(mockSubmit).not.toHaveBeenCalled();
    });

    test('does not claim rows that are already COMMITTED or DEAD_LETTER', async () => {
      await seedRow('mv-done', { status: 'COMMITTED' });
      await seedRow('mv-dead', { status: 'DEAD_LETTER' });

      const result = await drainOnce();

      expect(result.claimed).toBe(0);
      expect(mockSubmit).not.toHaveBeenCalled();
    });

    test('respects the batch size', async () => {
      for (const id of ['mv-1', 'mv-2', 'mv-3', 'mv-4', 'mv-5']) await seedRow(id);

      const result = await drainOnce({ batchSize: 2 });

      expect(result.claimed).toBe(2);
      expect(await prisma.olympusCommit.count({ where: { status: 'PENDING' } })).toBe(3);
    });

    // make_interval(secs => …) has to actually parse and push the row out of
    // the due window, or a claimed row would be re-claimed immediately.
    test('a claimed row is invisible for the visibility timeout', async () => {
      await seedRow('mv-1');
      mockSubmit.mockResolvedValue({ outcome: 'retryable', error: 'HTTP 503' });

      // Long backoff keeps the row out of the window for the second pass.
      await drainOnce({ visibilityTimeoutMs: 60_000, maxAttempts: 12 });
      const second = await drainOnce({ visibilityTimeoutMs: 60_000, maxAttempts: 12 });

      expect(second.claimed).toBe(0);
      const row = await prisma.olympusCommit.findFirstOrThrow();
      expect(row.attempts).toBe(1);
      expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    });

    // This is the test that actually pins SKIP LOCKED down. A worker holding a
    // row lock must cause other workers to *skip that row*, not queue behind it
    // — otherwise one slow or wedged worker stalls every other instance.
    //
    // Note the plain concurrency test below does NOT discriminate: without SKIP
    // LOCKED, Postgres still avoids a double claim (the blocked statement
    // re-evaluates its predicate and finds nextAttemptAt moved on). Only the
    // blocking behaviour separates the two.
    test('skips a row another worker holds locked instead of blocking on it', async () => {
      await seedRow('mv-locked');
      await seedRow('mv-free');

      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });

      // Hold an explicit row lock on mv-locked in a separate transaction.
      const holder = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "OlympusCommit" WHERE "recordId" = 'mv-locked' FOR UPDATE`;
          await gate;
        },
        { timeout: 30_000 },
      );

      await new Promise((resolve) => setTimeout(resolve, 250)); // let the lock settle

      let drained;
      try {
        drained = await Promise.race([
          drainOnce({ batchSize: 10 }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    'drainOnce blocked on a row locked by another worker — SKIP LOCKED is not in effect',
                  ),
                ),
              4_000,
            ),
          ),
        ]);
      } finally {
        release();
        await holder;
      }

      expect(drained.claimed).toBe(1);
      expect(mockSubmit.mock.calls.map((call) => call[0].recordId)).toEqual(['mv-free']);
      // The locked row was left untouched for whoever holds it.
      const locked = await prisma.olympusCommit.findFirstOrThrow({
        where: { recordId: 'mv-locked' },
      });
      expect(locked).toMatchObject({ status: 'PENDING', attempts: 0 });
    });

    test('concurrent drains never claim the same row twice', async () => {
      const ids = ['mv-1', 'mv-2', 'mv-3', 'mv-4', 'mv-5', 'mv-6'];
      for (const id of ids) await seedRow(id);

      // Widen the race window so both passes overlap.
      mockSubmit.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return committed();
      });

      const [a, b] = await Promise.all([
        drainOnce({ batchSize: 6 }),
        drainOnce({ batchSize: 6 }),
      ]);

      expect(a.claimed + b.claimed).toBe(ids.length);

      const submitted = mockSubmit.mock.calls.map((call) => call[0].recordId).sort();
      expect(submitted).toHaveLength(ids.length);
      expect(new Set(submitted).size).toBe(ids.length);

      expect(await prisma.olympusCommit.count({ where: { status: 'COMMITTED' } })).toBe(
        ids.length,
      );
    });
  });

  describe('failure persistence', () => {
    test('a retryable failure keeps the row PENDING and records the error', async () => {
      await seedRow('mv-1');
      mockSubmit.mockResolvedValue({ outcome: 'retryable', error: 'HTTP 503' });

      const result = await drainOnce({ maxAttempts: 12 });

      expect(result).toMatchObject({ retried: 1, deadLettered: 0 });
      const row = await prisma.olympusCommit.findFirstOrThrow();
      expect(row).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'HTTP 503' });
    });

    test('a permanent failure persists DEAD_LETTER', async () => {
      await seedRow('mv-1');
      mockSubmit.mockResolvedValue({ outcome: 'permanent', error: 'HTTP 409: conflict' });

      const result = await drainOnce({ maxAttempts: 12 });

      expect(result).toMatchObject({ deadLettered: 1 });
      const row = await prisma.olympusCommit.findFirstOrThrow();
      expect(row).toMatchObject({ status: 'DEAD_LETTER', lastError: 'HTTP 409: conflict' });
    });

    test('attempts accumulate across passes until the ceiling dead-letters the row', async () => {
      await seedRow('mv-1');
      mockSubmit.mockResolvedValue({ outcome: 'retryable', error: 'HTTP 500' });

      // visibilityTimeout 0 keeps the row due so successive passes re-claim it.
      await drainOnce({ visibilityTimeoutMs: 0, maxAttempts: 3 });
      await prisma.olympusCommit.updateMany({ data: { nextAttemptAt: new Date() } });
      await drainOnce({ visibilityTimeoutMs: 0, maxAttempts: 3 });
      await prisma.olympusCommit.updateMany({ data: { nextAttemptAt: new Date() } });
      const third = await drainOnce({ visibilityTimeoutMs: 0, maxAttempts: 3 });

      expect(third).toMatchObject({ deadLettered: 1 });
      const row = await prisma.olympusCommit.findFirstOrThrow();
      expect(row).toMatchObject({ status: 'DEAD_LETTER', attempts: 3 });
    });
  });
});
