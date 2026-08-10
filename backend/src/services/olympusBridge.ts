/**
 * Olympus ledger client.
 *
 * Anchors a TiM record to an Olympus node so the record's existence and
 * content can be proven later by a third party. This module is pure HTTP —
 * durability lives in `olympusOutbox.ts`, which is what callers should use.
 *
 * ## Why multipart, and not a JSON attestation
 *
 * Olympus deliberately has no "client asserts a hash" ingest route. The JSON
 * path (`POST /ingest/records`) was removed under its audit finding H-5: the
 * ledger would have committed to a digest whose preimage the server never saw,
 * so a buggy or malicious client could anchor "evidence" whose bytes never
 * existed. The supported route is `POST /ingest/files`, where the server hashes
 * the bytes it receives.
 *
 * So we serialize the anchor document and upload it as a file. The bytes we
 * send are the evidence; `content_hash` in the response is BLAKE3 over exactly
 * those bytes.
 */

/** Record kinds TiM anchors. Mirrors the `OlympusRecordType` Prisma enum. */
export type OlympusRecordType = 'MOVEMENT' | 'LAB_REPORT' | 'SIGNOFF';

export interface OlympusAnchor {
  type: OlympusRecordType;
  tenantId: string;
  recordId: string;
  data: Record<string, unknown>;
}

/**
 * Outcome of a submission attempt.
 *
 * `retryable` and `permanent` are distinguished so the outbox knows whether
 * backing off can ever help. Dead-lettering a recoverable failure would strand
 * an audit record; retrying an unrecoverable one spins forever.
 */
export type OlympusSubmitResult =
  | {
      outcome: 'committed';
      proofId: string;
      contentHash: string;
      /** True when Olympus already held these exact bytes (HTTP 200, not 201). */
      deduplicated: boolean;
    }
  | { outcome: 'retryable'; error: string }
  | { outcome: 'permanent'; error: string };

/** Schema tag embedded in every anchor document, so bytes are self-describing. */
const ANCHOR_SCHEMA = 'tim.olympus.anchor/v1';

/** Olympus caps `record_id` at 256 chars with no control characters. */
const RECORD_ID_MAX = 256;

/** Olympus `shard_id` grammar: 1–128 chars of [A-Za-z0-9:._-]. */
const SHARD_ID_RE = /^[A-Za-z0-9:._-]{1,128}$/;

const DEFAULT_TIMEOUT_MS = 15_000;

function olympusUrl(): string {
  return (process.env.OLYMPUS_URL ?? '').trim().replace(/\/+$/, '');
}

/**
 * Whether anchoring is configured at all.
 *
 * When false the outbox does not enqueue, so a deployment that does not use
 * Olympus does not accumulate rows that could never drain.
 */
export function isOlympusEnabled(): boolean {
  return olympusUrl().length > 0;
}

function shardId(): string {
  return (process.env.OLYMPUS_SHARD_ID ?? 'files').trim() || 'files';
}

/**
 * Recursively sorts object keys so the same logical record always serializes
 * to the same bytes — otherwise re-anchoring a record could produce a second
 * `content_hash` for identical content and defeat Olympus's deduplication.
 *
 * This is key-ordering determinism only. It is deliberately NOT Olympus's
 * canonical-JSON profile (`crates/olympus-crypto/src/canonical.rs`), which
 * additionally applies NFC normalization and exact-decimal number rules. That
 * profile governs Olympus's own internal digests; these bytes are hashed raw
 * as an opaque file, so agreement with it is not required.
 */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, sortKeysDeep(source[key])]),
    );
  }
  return value;
}

/**
 * The exact bytes committed to the ledger for an anchor.
 *
 * Exported so tests and any future offline verification can reproduce the
 * preimage of `content_hash` without going through the HTTP path.
 */
export function buildAnchorDocument(anchor: OlympusAnchor): string {
  return JSON.stringify(
    sortKeysDeep({
      schema: ANCHOR_SCHEMA,
      type: anchor.type,
      tenantId: anchor.tenantId,
      recordId: anchor.recordId,
      data: anchor.data,
    }),
  );
}

/**
 * Ledger-side record identity. Namespaced so TiM anchors cannot collide with
 * other writers sharing the shard.
 */
export function buildLedgerRecordId(anchor: OlympusAnchor): string {
  return `tim:${anchor.tenantId}:${anchor.type}:${anchor.recordId}`;
}

/**
 * Maps an HTTP status to a retry decision.
 *
 * 401/403 are treated as retryable on purpose: the usual cause is a rotated or
 * not-yet-provisioned API key, or a shard an operator has not registered yet.
 * All of those are fixed by an operator while rows wait, and dead-lettering
 * every anchor written during a key rotation would be worse than backing off.
 * The attempt ceiling still bounds it.
 */
function classifyStatus(status: number): 'retryable' | 'permanent' {
  // 409: Olympus's ledger is insert-only — this record identity is already
  // committed with different content. No amount of retrying resolves that.
  if (status === 409) return 'permanent';
  if (status === 400 || status === 413 || status === 422) return 'permanent';
  if (status === 401 || status === 403 || status === 429) return 'retryable';
  return status >= 500 ? 'retryable' : 'permanent';
}

/** Truncates a server error body so it cannot bloat `lastError`. */
function briefly(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > 300 ? `${collapsed.slice(0, 300)}…` : collapsed;
}

/**
 * Submits one anchor to `POST /ingest/files`.
 *
 * Never throws: every failure is reported as a typed outcome so the outbox can
 * make a retry decision rather than losing the record to an exception.
 */
export async function submitToOlympus(anchor: OlympusAnchor): Promise<OlympusSubmitResult> {
  const baseUrl = olympusUrl();
  if (!baseUrl) {
    return { outcome: 'retryable', error: 'OLYMPUS_URL is not configured' };
  }

  const apiKey = (process.env.OLYMPUS_API_KEY ?? '').trim();
  if (!apiKey) {
    // Retryable: an operator provisioning the key later drains the backlog.
    return { outcome: 'retryable', error: 'OLYMPUS_API_KEY is not configured' };
  }

  const shard = shardId();
  if (!SHARD_ID_RE.test(shard)) {
    return {
      outcome: 'permanent',
      error: `OLYMPUS_SHARD_ID must be 1–128 chars of [A-Za-z0-9:._-] (got "${shard}")`,
    };
  }

  const ledgerRecordId = buildLedgerRecordId(anchor);
  // eslint-disable-next-line no-control-regex
  if (ledgerRecordId.length > RECORD_ID_MAX || /[\u0000-\u001F\u007F]/.test(ledgerRecordId)) {
    return {
      outcome: 'permanent',
      error: `Derived record_id is unusable (length ${ledgerRecordId.length}, max ${RECORD_ID_MAX}, control characters forbidden)`,
    };
  }

  const document = buildAnchorDocument(anchor);

  const form = new FormData();
  form.append('file', new Blob([document], { type: 'application/json' }), `${ledgerRecordId}.json`);
  form.append('shard_id', shard);
  form.append('record_id', ledgerRecordId);
  form.append('version', '1');

  const timeoutMs = Number(process.env.OLYMPUS_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/ingest/files`, {
      method: 'POST',
      // Content-Type is intentionally unset: fetch derives the multipart
      // boundary from the FormData body, and setting it by hand breaks it.
      headers: { 'x-api-key': apiKey },
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // Network error, DNS failure, or timeout — all transient by nature.
    return {
      outcome: 'retryable',
      error: err instanceof Error ? `${err.name}: ${err.message}` : 'Unknown transport error',
    };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {
      outcome: classifyStatus(res.status),
      error: `HTTP ${res.status}${body ? `: ${briefly(body)}` : ''}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return { outcome: 'retryable', error: `HTTP ${res.status} with an unparsable JSON body` };
  }

  const result = parsed as { proof_id?: unknown; content_hash?: unknown };
  if (typeof result.proof_id !== 'string' || typeof result.content_hash !== 'string') {
    // A 2xx without the commit identifiers means we cannot record what was
    // anchored. Treat it as retryable rather than marking the row committed
    // with no proof of what it committed to.
    return {
      outcome: 'retryable',
      error: `HTTP ${res.status} response lacked proof_id / content_hash`,
    };
  }

  return {
    outcome: 'committed',
    proofId: result.proof_id,
    contentHash: result.content_hash,
    // Olympus answers 201 for a new commit and 200 when the content was
    // already on the ledger.
    deduplicated: res.status === 200,
  };
}
