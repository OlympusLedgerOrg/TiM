// Unit tests for the Olympus HTTP client.
//
// The real `submitToOlympus` is exercised against a mocked global fetch, so the
// request it actually builds (route, auth header, multipart fields) is asserted
// rather than assumed.

import {
  buildAnchorDocument,
  buildLedgerRecordId,
  submitToOlympus,
  isOlympusEnabled,
  type OlympusAnchor,
} from '../src/services/olympusBridge';

const originalFetch = global.fetch;

const anchor: OlympusAnchor = {
  type: 'MOVEMENT',
  tenantId: 'tenant-1',
  recordId: 'rec-1',
  data: { batchId: 'b-1', quantity: 500 },
};

function mockFetch(impl: jest.Mock) {
  global.fetch = impl as unknown as typeof fetch;
}

/** A successful Olympus `CommitResult` body. */
function commitBody(overrides: Record<string, unknown> = {}) {
  return {
    proof_id: 'proof-abc',
    content_hash: 'a'.repeat(64),
    record_id: buildLedgerRecordId(anchor),
    shard_id: 'files',
    deduplicated: false,
    redaction_format: null,
    ...overrides,
  };
}

function okResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function errorResponse(status: number, body = 'failure detail') {
  return {
    ok: false,
    status,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(body),
  };
}

beforeEach(() => {
  process.env.OLYMPUS_URL = 'http://olympus.test';
  process.env.OLYMPUS_API_KEY = 'test-key';
  delete process.env.OLYMPUS_SHARD_ID;
});

afterAll(() => {
  global.fetch = originalFetch;
  delete process.env.OLYMPUS_URL;
  delete process.env.OLYMPUS_API_KEY;
});

describe('isOlympusEnabled', () => {
  test('is false when OLYMPUS_URL is unset', () => {
    delete process.env.OLYMPUS_URL;
    expect(isOlympusEnabled()).toBe(false);
  });

  test('is false when OLYMPUS_URL is whitespace only', () => {
    process.env.OLYMPUS_URL = '   ';
    expect(isOlympusEnabled()).toBe(false);
  });

  test('is true when OLYMPUS_URL is set', () => {
    expect(isOlympusEnabled()).toBe(true);
  });
});

describe('buildAnchorDocument', () => {
  test('is insensitive to key insertion order', () => {
    const a = buildAnchorDocument({
      ...anchor,
      data: { batchId: 'b-1', lotNumber: 'LOT-1', quantity: 500 },
    });
    const b = buildAnchorDocument({
      ...anchor,
      data: { quantity: 500, batchId: 'b-1', lotNumber: 'LOT-1' },
    });
    expect(a).toBe(b);
  });

  test('sorts nested keys too', () => {
    const a = buildAnchorDocument({ ...anchor, data: { outer: { z: 1, a: 2 } } });
    const b = buildAnchorDocument({ ...anchor, data: { outer: { a: 2, z: 1 } } });
    expect(a).toBe(b);
    expect(a).toContain('{"a":2,"z":1}');
  });

  // Determinism must not come at the cost of collapsing distinct records:
  // a document that differs anywhere must produce different bytes, or the
  // ledger would deduplicate two genuinely different anchors onto one hash.
  test('differs when any committed value differs', () => {
    const base = buildAnchorDocument(anchor);
    expect(buildAnchorDocument({ ...anchor, recordId: 'rec-2' })).not.toBe(base);
    expect(buildAnchorDocument({ ...anchor, tenantId: 'tenant-2' })).not.toBe(base);
    expect(buildAnchorDocument({ ...anchor, type: 'SIGNOFF' })).not.toBe(base);
    expect(buildAnchorDocument({ ...anchor, data: { batchId: 'b-1', quantity: 501 } })).not.toBe(
      base,
    );
  });

  test('carries a schema tag and the record identity', () => {
    const parsed = JSON.parse(buildAnchorDocument(anchor));
    expect(parsed).toMatchObject({
      schema: 'tim.olympus.anchor/v1',
      type: 'MOVEMENT',
      tenantId: 'tenant-1',
      recordId: 'rec-1',
      data: { batchId: 'b-1', quantity: 500 },
    });
  });
});

describe('submitToOlympus — request shape', () => {
  test('POSTs multipart to /ingest/files with the API key header', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse(201, commitBody()));
    mockFetch(fetchMock);

    await submitToOlympus(anchor);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://olympus.test/ingest/files');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'x-api-key': 'test-key' });
    // Content-Type must be left to fetch so the multipart boundary is correct.
    expect(Object.keys(init.headers)).not.toContain('Content-Type');
    expect(init.body).toBeInstanceOf(FormData);

    const form = init.body as FormData;
    expect(form.get('shard_id')).toBe('files');
    expect(form.get('record_id')).toBe('tim:tenant-1:MOVEMENT:rec-1');
    expect(form.get('version')).toBe('1');
    expect(form.get('file')).toBeInstanceOf(Blob);
  });

  test('uploads exactly the anchor document bytes', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse(201, commitBody()));
    mockFetch(fetchMock);

    await submitToOlympus(anchor);

    const form = fetchMock.mock.calls[0][1].body as FormData;
    const uploaded = await (form.get('file') as Blob).text();
    expect(uploaded).toBe(buildAnchorDocument(anchor));
  });

  test('strips a trailing slash from OLYMPUS_URL', async () => {
    process.env.OLYMPUS_URL = 'http://olympus.test/';
    const fetchMock = jest.fn().mockResolvedValue(okResponse(201, commitBody()));
    mockFetch(fetchMock);

    await submitToOlympus(anchor);

    expect(fetchMock.mock.calls[0][0]).toBe('http://olympus.test/ingest/files');
  });

  test('honours OLYMPUS_SHARD_ID', async () => {
    process.env.OLYMPUS_SHARD_ID = 'tim.anchors';
    const fetchMock = jest.fn().mockResolvedValue(okResponse(201, commitBody()));
    mockFetch(fetchMock);

    await submitToOlympus(anchor);

    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get('shard_id')).toBe('tim.anchors');
  });
});

describe('submitToOlympus — outcomes', () => {
  test('201 commits and reports the proof identifiers', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse(201, commitBody())));

    const result = await submitToOlympus(anchor);

    expect(result).toEqual({
      outcome: 'committed',
      proofId: 'proof-abc',
      contentHash: 'a'.repeat(64),
      deduplicated: false,
    });
  });

  test('200 marks the commit as deduplicated', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse(200, commitBody())));

    const result = await submitToOlympus(anchor);

    expect(result).toMatchObject({ outcome: 'committed', deduplicated: true });
  });

  test('409 is permanent — the insert-only ledger refuses to overwrite', async () => {
    mockFetch(jest.fn().mockResolvedValue(errorResponse(409, 'already committed')));

    const result = await submitToOlympus(anchor);

    expect(result.outcome).toBe('permanent');
    expect(result).toHaveProperty('error', expect.stringContaining('409'));
  });

  test.each([400, 413, 422])('%i is permanent', async (status) => {
    mockFetch(jest.fn().mockResolvedValue(errorResponse(status)));

    const result = await submitToOlympus(anchor);

    expect(result.outcome).toBe('permanent');
    expect(result).toHaveProperty('error', expect.stringContaining(String(status)));
  });

  // An operator can fix these while rows wait; dead-lettering every anchor
  // written during a key rotation would strand audit records.
  test.each([401, 403, 429, 500, 503])('%i is retryable', async (status) => {
    mockFetch(jest.fn().mockResolvedValue(errorResponse(status)));

    const result = await submitToOlympus(anchor);

    expect(result.outcome).toBe('retryable');
    expect(result).toHaveProperty('error', expect.stringContaining(String(status)));
  });

  test('a transport failure is retryable and names the cause', async () => {
    mockFetch(jest.fn().mockRejectedValue(new Error('socket hang up')));

    const result = await submitToOlympus(anchor);

    expect(result.outcome).toBe('retryable');
    expect(result).toHaveProperty('error', expect.stringContaining('socket hang up'));
  });

  test('a 2xx without proof_id is retryable, not a silent success', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse(201, { content_hash: 'x' })));

    const result = await submitToOlympus(anchor);

    expect(result.outcome).toBe('retryable');
    expect(result).toHaveProperty('error', expect.stringContaining('proof_id'));
  });

  test('an unparsable 2xx body is retryable', async () => {
    mockFetch(
      jest.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.reject(new Error('bad json')),
        text: () => Promise.resolve('<html>'),
      }),
    );

    const result = await submitToOlympus(anchor);

    expect(result.outcome).toBe('retryable');
    expect(result).toHaveProperty('error', expect.stringContaining('unparsable'));
  });

  test('missing OLYMPUS_URL is retryable and sends nothing', async () => {
    delete process.env.OLYMPUS_URL;
    const fetchMock = jest.fn();
    mockFetch(fetchMock);

    const result = await submitToOlympus(anchor);

    expect(result).toEqual({ outcome: 'retryable', error: 'OLYMPUS_URL is not configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('missing OLYMPUS_API_KEY is retryable and sends nothing', async () => {
    delete process.env.OLYMPUS_API_KEY;
    const fetchMock = jest.fn();
    mockFetch(fetchMock);

    const result = await submitToOlympus(anchor);

    expect(result).toEqual({ outcome: 'retryable', error: 'OLYMPUS_API_KEY is not configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a shard id outside the Olympus grammar is permanent and sends nothing', async () => {
    process.env.OLYMPUS_SHARD_ID = 'not a valid shard!';
    const fetchMock = jest.fn();
    mockFetch(fetchMock);

    const result = await submitToOlympus(anchor);

    expect(result.outcome).toBe('permanent');
    expect(result).toHaveProperty('error', expect.stringContaining('OLYMPUS_SHARD_ID'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('an over-long derived record_id is permanent and sends nothing', async () => {
    const fetchMock = jest.fn();
    mockFetch(fetchMock);

    const result = await submitToOlympus({ ...anchor, recordId: 'r'.repeat(300) });

    expect(result.outcome).toBe('permanent');
    expect(result).toHaveProperty('error', expect.stringContaining('record_id'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
