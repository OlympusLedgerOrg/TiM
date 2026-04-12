const OLYMPUS_URL = process.env.OLYMPUS_URL ?? '';

export async function commitToOlympus(payload: {
  type: 'MOVEMENT' | 'LAB_REPORT' | 'SIGNOFF';
  tenantId: string;
  recordId: string;
  data: Record<string, unknown>;
}): Promise<string | null> {
  if (!OLYMPUS_URL) return null;
  try {
    const res = await fetch(`${OLYMPUS_URL}/api/v1/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { commit_id?: string };
    return data.commit_id ?? null;
  } catch {
    return null;
  }
}
