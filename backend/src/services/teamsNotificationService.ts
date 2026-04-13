import { prisma } from '../prisma/client.js';

/**
 * Teams Notification Service — Webhook alerts for the plant floor
 *
 * This is NOT a Teams bot. Floor workers don't need to chat with TiM.
 * What they need is:
 *
 * 1. 🔴 DOWNTIME ALERT → #plant-floor channel when press goes down
 * 2. ❌ QUALITY FAIL   → #qc-team channel when lab report fails
 * 3. ⚠️  SHORTAGE       → #material-planning when allocation can't fill an order
 * 4. 🚨 ESCALATION     → #shift-leads when downtime exceeds threshold
 *
 * Uses Microsoft Teams Incoming Webhooks (no bot registration needed).
 * Each tenant configures their own webhook URLs per channel.
 *
 * Teams Adaptive Card format for rich, actionable notifications
 * that look good on mobile (supervisors checking Teams on their phone).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertType = 'downtime' | 'quality_fail' | 'shortage' | 'escalation';

interface DowntimePayload {
  equipmentCode: string;
  equipmentName: string;
  category: string;
  reasonCode: string;
  reasonText?: string;
  startedAt: string;
  durationMin?: number;
}

interface QualityFailPayload {
  batchLotNumber: string;
  materialDescription: string;
  labReportId: string;
  result: string;
  submittedBy: string;
}

interface ShortagePayload {
  materialDescription: string;
  materialNumber: string;
  requiredQty: number;
  shortageQty: number;
  workOrderId: string;
  uom: string;
}

interface EscalationPayload {
  equipmentCode: string;
  equipmentName: string;
  downtimeMin: number;
  thresholdMin: number;
  category: string;
  reasonCode: string;
}

type AlertPayload = DowntimePayload | QualityFailPayload | ShortagePayload | EscalationPayload;

// ─── Adaptive Card Builders ───────────────────────────────────────────────────

function buildDowntimeCard(payload: DowntimePayload) {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          {
            type: 'TextBlock',
            size: 'Large',
            weight: 'Bolder',
            color: 'Attention',
            text: `🔴 EQUIPMENT DOWN: ${payload.equipmentCode}`,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Equipment', value: payload.equipmentName },
              { title: 'Category', value: payload.category },
              { title: 'Reason Code', value: payload.reasonCode },
              ...(payload.reasonText ? [{ title: 'Details', value: payload.reasonText }] : []),
              { title: 'Down Since', value: new Date(payload.startedAt).toLocaleTimeString('en-US') },
              ...(payload.durationMin ? [{ title: 'Duration', value: `${Math.round(payload.durationMin)} min` }] : []),
            ],
          },
        ],
      },
    }],
  };
}

function buildQualityFailCard(payload: QualityFailPayload) {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          {
            type: 'TextBlock',
            size: 'Large',
            weight: 'Bolder',
            color: 'Attention',
            text: `❌ QUALITY FAIL: ${payload.batchLotNumber}`,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Material', value: payload.materialDescription },
              { title: 'Lot', value: payload.batchLotNumber },
              { title: 'Result', value: payload.result },
              { title: 'Submitted By', value: payload.submittedBy },
            ],
          },
        ],
      },
    }],
  };
}

function buildShortageCard(payload: ShortagePayload) {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          {
            type: 'TextBlock',
            size: 'Large',
            weight: 'Bolder',
            color: 'Warning',
            text: `⚠️ MATERIAL SHORTAGE`,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Material', value: `${payload.materialDescription} (${payload.materialNumber})` },
              { title: 'Required', value: `${payload.requiredQty} ${payload.uom}` },
              { title: 'Short', value: `${payload.shortageQty} ${payload.uom}` },
              { title: 'Work Order', value: payload.workOrderId },
            ],
          },
        ],
      },
    }],
  };
}

function buildEscalationCard(payload: EscalationPayload) {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          {
            type: 'TextBlock',
            size: 'Large',
            weight: 'Bolder',
            color: 'Attention',
            text: `🚨 DOWNTIME ESCALATION: ${payload.equipmentCode}`,
          },
          {
            type: 'TextBlock',
            text: `Equipment has been down for **${Math.round(payload.downtimeMin)} minutes** (threshold: ${payload.thresholdMin} min)`,
            wrap: true,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Equipment', value: payload.equipmentName },
              { title: 'Category', value: payload.category },
              { title: 'Reason', value: payload.reasonCode },
              { title: 'Duration', value: `${Math.round(payload.downtimeMin)} min` },
            ],
          },
        ],
      },
    }],
  };
}

// ─── Core Send Function ───────────────────────────────────────────────────────

/**
 * Send an alert to all matching Teams webhooks for a tenant.
 *
 * Fire-and-forget pattern — never blocks the caller.
 * Teams webhook failures are logged but don't affect plant operations.
 */
export async function sendTeamsAlert(
  tenantId: string,
  alertType: AlertType,
  payload: AlertPayload,
): Promise<{ sent: number; failed: number }> {
  // Find webhooks that subscribe to this alert type
  const filterField = {
    downtime: 'onDowntime',
    quality_fail: 'onQualityFail',
    shortage: 'onShortage',
    escalation: 'onEscalation',
  }[alertType] as string;

  const webhooks = await prisma.teamsWebhook.findMany({
    where: {
      tenantId,
      isActive: true,
      [filterField]: true,
    },
  });

  if (webhooks.length === 0) {
    return { sent: 0, failed: 0 };
  }

  // Build the card based on alert type
  let card: object;
  switch (alertType) {
    case 'downtime':
      card = buildDowntimeCard(payload as DowntimePayload);
      break;
    case 'quality_fail':
      card = buildQualityFailCard(payload as QualityFailPayload);
      break;
    case 'shortage':
      card = buildShortageCard(payload as ShortagePayload);
      break;
    case 'escalation':
      card = buildEscalationCard(payload as EscalationPayload);
      break;
  }

  let sent = 0;
  let failed = 0;

  // Send to each webhook in parallel (5-second timeout per webhook)
  const results = await Promise.allSettled(
    webhooks.map(async (webhook) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const res = await fetch(webhook.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(card),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Teams webhook responded ${res.status}`);
        }
      } finally {
        clearTimeout(timeout);
      }
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') sent++;
    else failed++;
  }

  return { sent, failed };
}

// ─── Escalation Check ─────────────────────────────────────────────────────────

/**
 * Check for downtime events that have exceeded their escalation threshold.
 *
 * Called periodically (e.g., every 5 minutes) to find open downtime events
 * that haven't been escalated yet and exceed the tenant's threshold.
 */
export async function checkDowntimeEscalations(tenantId: string): Promise<number> {
  // Get all webhooks with escalation enabled
  const webhooks = await prisma.teamsWebhook.findMany({
    where: { tenantId, isActive: true, onEscalation: true },
  });

  if (webhooks.length === 0) return 0;

  // Find the minimum threshold across all webhooks
  const minThreshold = Math.min(...webhooks.map(w => w.downtimeThresholdMin));

  // Find open downtime events that exceed threshold and haven't been escalated
  const thresholdTime = new Date(Date.now() - minThreshold * 60 * 1000);

  const events = await prisma.downtimeEvent.findMany({
    where: {
      tenantId,
      endedAt: null,
      escalatedToTeams: false,
      startedAt: { lte: thresholdTime },
    },
    include: {
      equipment: true,
    },
  });

  let escalated = 0;

  for (const event of events) {
    const durationMin = (Date.now() - event.startedAt.getTime()) / 60000;

    await sendTeamsAlert(tenantId, 'escalation', {
      equipmentCode: event.equipment.code,
      equipmentName: event.equipment.name,
      downtimeMin: durationMin,
      thresholdMin: minThreshold,
      category: event.category,
      reasonCode: event.reasonCode,
    });

    await prisma.downtimeEvent.update({
      where: { id: event.id },
      data: { escalatedToTeams: true, escalatedAt: new Date() },
    });

    escalated++;
  }

  return escalated;
}

// ─── Webhook Management ───────────────────────────────────────────────────────

/**
 * Get all configured Teams webhooks for a tenant.
 */
export async function getTeamsWebhooks(tenantId: string) {
  const webhooks = await prisma.teamsWebhook.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  });

  return {
    status: 200,
    body: {
      webhooks: webhooks.map(w => ({
        id: w.id,
        name: w.name,
        channel: w.channel,
        onDowntime: w.onDowntime,
        onQualityFail: w.onQualityFail,
        onShortage: w.onShortage,
        onEscalation: w.onEscalation,
        downtimeThresholdMin: w.downtimeThresholdMin,
        isActive: w.isActive,
      })),
    },
  };
}

/**
 * Create or update a Teams webhook configuration.
 */
export async function upsertTeamsWebhook(opts: {
  tenantId: string;
  name: string;
  webhookUrl: string;
  channel: string;
  onDowntime?: boolean;
  onQualityFail?: boolean;
  onShortage?: boolean;
  onEscalation?: boolean;
  downtimeThresholdMin?: number;
}) {
  const webhook = await prisma.teamsWebhook.upsert({
    where: {
      tenantId_name: {
        tenantId: opts.tenantId,
        name: opts.name,
      },
    },
    update: {
      webhookUrl: opts.webhookUrl,
      channel: opts.channel,
      onDowntime: opts.onDowntime,
      onQualityFail: opts.onQualityFail,
      onShortage: opts.onShortage,
      onEscalation: opts.onEscalation,
      downtimeThresholdMin: opts.downtimeThresholdMin,
    },
    create: {
      tenantId: opts.tenantId,
      name: opts.name,
      webhookUrl: opts.webhookUrl,
      channel: opts.channel,
      onDowntime: opts.onDowntime ?? true,
      onQualityFail: opts.onQualityFail ?? true,
      onShortage: opts.onShortage ?? true,
      onEscalation: opts.onEscalation ?? true,
      downtimeThresholdMin: opts.downtimeThresholdMin ?? 15,
    },
  });

  return {
    status: 200,
    body: {
      webhook: {
        id: webhook.id,
        name: webhook.name,
        channel: webhook.channel,
        isActive: webhook.isActive,
      },
    },
  };
}

/**
 * Send a test notification to verify webhook is working.
 */
export async function testTeamsWebhook(tenantId: string, webhookId: string) {
  const webhook = await prisma.teamsWebhook.findFirst({
    where: { id: webhookId, tenantId },
  });
  if (!webhook) {
    return { status: 404, body: { message: 'Webhook not found' } };
  }

  const testCard = {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          {
            type: 'TextBlock',
            size: 'Large',
            weight: 'Bolder',
            color: 'Good',
            text: '✅ TiM Test Notification',
          },
          {
            type: 'TextBlock',
            text: `This is a test alert from TiM. Webhook **${webhook.name}** is working correctly.`,
            wrap: true,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Channel', value: webhook.channel },
              { title: 'Sent At', value: new Date().toLocaleString('en-US') },
            ],
          },
        ],
      },
    }],
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(webhook.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testCard),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { status: 502, body: { message: `Teams returned ${res.status}`, success: false } };
    }

    return { status: 200, body: { message: 'Test notification sent', success: true } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { status: 502, body: { message: `Failed to reach Teams: ${message}`, success: false } };
  }
}
