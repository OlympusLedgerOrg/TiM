/**
 * Teams Notification Service — Frontend API client
 *
 * Used by supervisors to configure which Teams channels get alerts.
 * Floor workers don't interact with this directly — they just see
 * the result (their phone buzzes when their press has been down > 15 min).
 *
 * Rutherfordton channels:
 *  - #main-plant-alerts
 *  - #shipping-alerts
 *  - #new-plant-alerts
 *  - #qc-team (site-wide)
 *  - #shift-leads (escalations)
 */

const API_BASE = '/api/v1/teams';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Not authenticated');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamsWebhookConfig {
  id: string;
  name: string;
  channel: string;
  plantAreaCode?: string;
  onDowntime: boolean;
  onQualityFail: boolean;
  onShortage: boolean;
  onEscalation: boolean;
  downtimeThresholdMin: number;
  isActive: boolean;
}

// ─── Webhook Management ───────────────────────────────────────────────────────

export async function getWebhooks(): Promise<{ webhooks: TeamsWebhookConfig[] }> {
  const res = await fetch(`${API_BASE}/webhooks`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch webhooks: ${res.status}`);
  return res.json();
}

export async function saveWebhook(data: {
  name: string;
  webhookUrl: string;
  channel: string;
  plantAreaCode?: string;
  onDowntime?: boolean;
  onQualityFail?: boolean;
  onShortage?: boolean;
  onEscalation?: boolean;
  downtimeThresholdMin?: number;
}): Promise<{ webhook: { id: string; name: string; isActive: boolean } }> {
  const res = await fetch(`${API_BASE}/webhooks`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(err.message || `Failed to save webhook: ${res.status}`);
  }
  return res.json();
}

export async function testWebhook(webhookId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/webhooks/${webhookId}/test`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(err.message || `Test failed: ${res.status}`);
  }
  return res.json();
}

export async function triggerEscalationCheck(): Promise<{ escalated: number }> {
  const res = await fetch(`${API_BASE}/check-escalations`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Escalation check failed: ${res.status}`);
  return res.json();
}
