// Unit tests for the Olympus anchor outbox: transactional enqueue and the
// drain pass's retry / dead-letter decisions.

jest.mock('../src/services/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../src/services/olympusBridge', () => ({
  submitToOlympus: jest.fn(),
  isOlympusEnabled: jest.fn(),
}));

const mockPrisma = {
  olympusCommit: { upsert: jest.fn(), update: jest.fn() },
  movement: { updateMany: jest.fn() },
  labReport: { updateMany: jest.fn() },
  signoff: { updateMany: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};
jest.mock('../src/prisma/client', () => ({ prisma: mockPrisma }));

import { isOlympusEnabled, submitToOlympus } from '../src/services/olympusBridge';
import {
  backoffMs,
  drainOnce,
  enqueueOlympusCommit,
  startOlympusDrainer,
} from '../src/services/olympusOutbox';

const mockSubmit = submitToOlympus as jest.Mock;
const mockEnabled = isOlympusEnabled as jest.Mock;

/** A row as returned by the claim query (attempts already incremented). */
function claimedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ob-1',
    tenantId: 'tenant-1',
    recordType: 'MOVEMENT',
    recordId: 'mv-1',
    payload: { batchId: 'b-1' },
    attempts: 1,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnabled.mockReturnValue(true);
  mockPrisma.$queryRaw.mockResolvedValue([]);
  // Interactive transactions run their callback against the same mock client.
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(mockPrisma),
  );
});

describe('enqueueOlympusCommit', () => {
  test('no-ops when anchoring is not configured', async () => {
    mockEnabled.mockReturnValue(false);

    await enqueueOlympusCommit(mockPrisma as never, {
      type: 'MOVEMENT',
      tenantId: 't-1',
      recordId: 'mv-1',
      data: {},
    });

    // Otherwise a deployment that never anchors would accumulate rows that
    // could never drain.
    expect(mockPrisma.olympusCommit.upsert).not.toHaveBeenCalled();
  });

  test('upserts on the record identity so a retry cannot double-enqueue', async () => {
    await enqueueOlympusCommit(mockPrisma as never, {
      type: 'LAB_REPORT',
      tenantId: 't-1',
      recordId: 'lr-1',
      data: { fileHash: 'abc' },
    });

    expect(mockPrisma.olympusCommit.upsert).toHaveBeenCalledWith({
      where: { recordType_recordId: { recordType: 'LAB_REPORT', recordId: 'lr-1' } },
      create: {
        tenantId: 't-1',
        recordType: 'LAB_REPORT',
        recordId: 'lr-1',
        payload: { fileHash: 'abc' },
      },
      update: {},
    });
  });

  test('writes through the transaction client it is given', async () => {
    const tx = { olympusCommit: { upsert: jest.fn() } };

    await enqueueOlympusCommit(tx as never, {
      type: 'SIGNOFF',
      tenantId: 't-1',
      recordId: 's-1',
      data: {},
    });

    // Atomicity with the domain write is the entire point — the enqueue must
    // not escape to the base client.
    expect(tx.olympusCommit.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.olympusCommit.upsert).not.toHaveBeenCalled();
  });
});

describe('drainOnce', () => {
  test('reports zeros when nothing is due', async () => {
    const result = await drainOnce();

    expect(result).toEqual({ claimed: 0, committed: 0, retried: 0, deadLettered: 0 });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  test('submits the claimed row as an anchor', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([claimedRow()]);
    mockSubmit.mockResolvedValue({
      outcome: 'committed',
      proofId: 'proof-1',
      contentHash: 'hash-1',
      deduplicated: false,
    });

    await drainOnce();

    expect(mockSubmit).toHaveBeenCalledWith({
      type: 'MOVEMENT',
      tenantId: 'tenant-1',
      recordId: 'mv-1',
      data: { batchId: 'b-1' },
    });
  });

  test('a commit marks the row COMMITTED and stamps the domain record', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([claimedRow()]);
    mockSubmit.mockResolvedValue({
      outcome: 'committed',
      proofId: 'proof-1',
      contentHash: 'hash-1',
      deduplicated: false,
    });

    const result = await drainOnce();

    expect(result).toMatchObject({ claimed: 1, committed: 1 });
    expect(mockPrisma.olympusCommit.update).toHaveBeenCalledWith({
      where: { id: 'ob-1' },
      data: {
        status: 'COMMITTED',
        proofId: 'proof-1',
        contentHash: 'hash-1',
        lastError: null,
      },
    });
    expect(mockPrisma.movement.updateMany).toHaveBeenCalledWith({
      where: { id: 'mv-1' },
      data: { olympusCommitId: 'proof-1' },
    });
    // Both writes must share one transaction.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['LAB_REPORT', 'labReport'],
    ['SIGNOFF', 'signoff'],
  ])('stamps the %s domain record', async (recordType, model) => {
    mockPrisma.$queryRaw.mockResolvedValue([claimedRow({ recordType, recordId: 'x-1' })]);
    mockSubmit.mockResolvedValue({
      outcome: 'committed',
      proofId: 'proof-9',
      contentHash: 'hash-9',
      deduplicated: true,
    });

    await drainOnce();

    const table = mockPrisma[model as 'labReport' | 'signoff'];
    expect(table.updateMany).toHaveBeenCalledWith({
      where: { id: 'x-1' },
      data: { olympusCommitId: 'proof-9' },
    });
  });

  test('a retryable failure reschedules without changing status', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([claimedRow({ attempts: 2 })]);
    mockSubmit.mockResolvedValue({ outcome: 'retryable', error: 'HTTP 503' });

    const before = Date.now();
    const result = await drainOnce({ maxAttempts: 12 });

    expect(result).toMatchObject({ claimed: 1, retried: 1, deadLettered: 0, committed: 0 });

    const call = mockPrisma.olympusCommit.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'ob-1' });
    expect(call.data.lastError).toBe('HTTP 503');
    expect(call.data.status).toBeUndefined();
    expect(call.data.nextAttemptAt.getTime()).toBeGreaterThan(before);
    // The domain record must not be stamped on a failed attempt.
    expect(mockPrisma.movement.updateMany).not.toHaveBeenCalled();
  });

  test('a permanent failure dead-letters immediately, without burning attempts', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([claimedRow({ attempts: 1 })]);
    mockSubmit.mockResolvedValue({ outcome: 'permanent', error: 'HTTP 409: already committed' });

    const result = await drainOnce({ maxAttempts: 12 });

    expect(result).toMatchObject({ claimed: 1, deadLettered: 1, retried: 0 });
    expect(mockPrisma.olympusCommit.update).toHaveBeenCalledWith({
      where: { id: 'ob-1' },
      data: { status: 'DEAD_LETTER', lastError: 'HTTP 409: already committed' },
    });
  });

  test('a retryable failure dead-letters once attempts reach the ceiling', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([claimedRow({ attempts: 5 })]);
    mockSubmit.mockResolvedValue({ outcome: 'retryable', error: 'HTTP 500' });

    const result = await drainOnce({ maxAttempts: 5 });

    expect(result).toMatchObject({ deadLettered: 1, retried: 0 });
    expect(mockPrisma.olympusCommit.update).toHaveBeenCalledWith({
      where: { id: 'ob-1' },
      data: { status: 'DEAD_LETTER', lastError: 'HTTP 500' },
    });
  });

  test('processes every claimed row, mixing outcomes', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      claimedRow({ id: 'ob-1', recordId: 'mv-1' }),
      claimedRow({ id: 'ob-2', recordId: 'mv-2' }),
      claimedRow({ id: 'ob-3', recordId: 'mv-3' }),
    ]);
    mockSubmit
      .mockResolvedValueOnce({
        outcome: 'committed',
        proofId: 'p-1',
        contentHash: 'h-1',
        deduplicated: false,
      })
      .mockResolvedValueOnce({ outcome: 'retryable', error: 'HTTP 503' })
      .mockResolvedValueOnce({ outcome: 'permanent', error: 'HTTP 400' });

    const result = await drainOnce({ maxAttempts: 12 });

    expect(result).toEqual({ claimed: 3, committed: 1, retried: 1, deadLettered: 1 });
  });
});

describe('startOlympusDrainer', () => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  test('polls repeatedly while running', async () => {
    const drainer = startOlympusDrainer({ pollIntervalMs: 5 });
    await sleep(40);
    await drainer.stop();

    expect(mockPrisma.$queryRaw.mock.calls.length).toBeGreaterThan(1);
  });

  test('schedules no further passes after stop()', async () => {
    const drainer = startOlympusDrainer({ pollIntervalMs: 5 });
    await sleep(30);
    await drainer.stop();

    const callsAtStop = mockPrisma.$queryRaw.mock.calls.length;
    await sleep(50);

    expect(mockPrisma.$queryRaw.mock.calls.length).toBe(callsAtStop);
  });

  // Graceful shutdown closes the Prisma pool right after this resolves, so a
  // pass still in flight would be cut off mid-submission.
  test('stop() waits for the in-flight pass to finish', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let passFinished = false;

    mockPrisma.$queryRaw.mockImplementation(async () => {
      await gate;
      passFinished = true;
      return [];
    });

    const drainer = startOlympusDrainer({ pollIntervalMs: 1_000 });
    await sleep(10); // let the first pass start and block on the gate

    const stopped = drainer.stop();
    expect(passFinished).toBe(false);

    release();
    await stopped;

    expect(passFinished).toBe(true);
  });

  test('a failing pass is logged and does not stop the loop', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('connection reset'));

    const drainer = startOlympusDrainer({ pollIntervalMs: 5 });
    await sleep(40);
    await drainer.stop();

    expect(mockPrisma.$queryRaw.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('backoffMs', () => {
  test('grows with the attempt count', async () => {
    // Full jitter makes each draw a range, so compare the ranges' floors.
    const early = Math.min(...Array.from({ length: 50 }, () => backoffMs(1)));
    const later = Math.min(...Array.from({ length: 50 }, () => backoffMs(5)));
    expect(later).toBeGreaterThan(early);
  });

  test('stays within the jitter window for the first attempt', () => {
    for (let i = 0; i < 100; i += 1) {
      const delay = backoffMs(1);
      expect(delay).toBeGreaterThanOrEqual(2_500);
      expect(delay).toBeLessThanOrEqual(5_000);
    }
  });

  test('is capped so a long outage cannot schedule an absurd delay', () => {
    for (const attempts of [20, 50, 100]) {
      expect(backoffMs(attempts)).toBeLessThanOrEqual(3_600_000);
    }
  });
});
