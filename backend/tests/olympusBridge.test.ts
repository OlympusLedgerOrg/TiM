// Unit tests for olympusBridge service
// We need to test the actual commitToOlympus function, so we don't mock it here.
// Instead we mock the global fetch.

const originalFetch = global.fetch;

beforeEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('commitToOlympus', () => {
  const payload = {
    type: 'MOVEMENT' as const,
    tenantId: 'default',
    recordId: 'rec-1',
    data: { batchId: 'b-1' },
  };

  test('returns null when OLYMPUS_URL is empty', async () => {
    // Clear the module cache to re-evaluate with empty OLYMPUS_URL
    const originalUrl = process.env.OLYMPUS_URL;
    delete process.env.OLYMPUS_URL;

    // Re-import to pick up the empty OLYMPUS_URL
    jest.resetModules();
    const { commitToOlympus } = await import('../src/services/olympusBridge');

    const result = await commitToOlympus(payload);
    expect(result).toBeNull();

    // Restore
    if (originalUrl !== undefined) {
      process.env.OLYMPUS_URL = originalUrl;
    }
  });

  test('returns commit_id on success', async () => {
    process.env.OLYMPUS_URL = 'http://localhost:9999';
    jest.resetModules();
    const { commitToOlympus } = await import('../src/services/olympusBridge');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ commit_id: 'abc-123' }),
    }) as any;

    const result = await commitToOlympus(payload);
    expect(result).toBe('abc-123');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    delete process.env.OLYMPUS_URL;
  });

  test('returns null when response is not ok', async () => {
    process.env.OLYMPUS_URL = 'http://localhost:9999';
    jest.resetModules();
    const { commitToOlympus } = await import('../src/services/olympusBridge');

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as any;

    const result = await commitToOlympus(payload);
    expect(result).toBeNull();

    delete process.env.OLYMPUS_URL;
  });

  test('returns null on fetch error', async () => {
    process.env.OLYMPUS_URL = 'http://localhost:9999';
    jest.resetModules();
    const { commitToOlympus } = await import('../src/services/olympusBridge');

    global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as any;

    const result = await commitToOlympus(payload);
    expect(result).toBeNull();

    delete process.env.OLYMPUS_URL;
  });

  test('returns null when response has no commit_id', async () => {
    process.env.OLYMPUS_URL = 'http://localhost:9999';
    jest.resetModules();
    const { commitToOlympus } = await import('../src/services/olympusBridge');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }) as any;

    const result = await commitToOlympus(payload);
    expect(result).toBeNull();

    delete process.env.OLYMPUS_URL;
  });
});
