import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { z } from 'zod';
import {
  getTeamsWebhooks,
  upsertTeamsWebhook,
  testTeamsWebhook,
  checkDowntimeEscalations,
} from '../services/teamsNotificationService.js';

const router = Router();

/**
 * Teams Notification Routes — Webhook configuration + test endpoints
 *
 * Rutherfordton has 3 plant areas. Each can have its own Teams channel:
 *  - #main-plant-alerts  (Main Plant presses, mixers)
 *  - #shipping-alerts    (Shipping area)
 *  - #new-plant-alerts   (New Plant equipment)
 *  - #qc-team            (Site-wide quality alerts)
 *  - #shift-leads        (Site-wide escalations)
 *
 * Supervisors configure which alerts go to which channels.
 * Floor workers see the result: their Teams phone buzzes when their press
 * has been down too long or QC flags a batch.
 */

// GET /api/v1/teams/webhooks
// List all configured webhooks for this tenant
router.get('/webhooks', requireAuth, requireRole(['Supervisor', 'Admin']), async (req, res) => {
  const result = await getTeamsWebhooks(req.user!.tenantId);
  return res.status(result.status).json(result.body);
});

// POST /api/v1/teams/webhooks
// Create or update a webhook
const webhookSchema = z.object({
  name: z.string().min(1).max(100),
  webhookUrl: z.string().url(),
  channel: z.string().min(1).max(100),
  plantAreaCode: z.string().max(10).optional(),
  onDowntime: z.boolean().optional(),
  onQualityFail: z.boolean().optional(),
  onShortage: z.boolean().optional(),
  onEscalation: z.boolean().optional(),
  downtimeThresholdMin: z.number().int().min(1).max(480).optional(),
});

router.post(
  '/webhooks',
  requireAuth,
  requireRole(['Supervisor', 'Admin']),
  async (req, res) => {
    const parse = webhookSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
    }

    const result = await upsertTeamsWebhook({
      tenantId: req.user!.tenantId,
      ...parse.data,
    });
    return res.status(result.status).json(result.body);
  },
);

// POST /api/v1/teams/webhooks/:id/test
// Send a test notification to verify the webhook works
router.post(
  '/webhooks/:id/test',
  requireAuth,
  requireRole(['Supervisor', 'Admin']),
  async (req, res) => {
    const result = await testTeamsWebhook(req.user!.tenantId, req.params.id);
    return res.status(result.status).json(result.body);
  },
);

// POST /api/v1/teams/check-escalations
// Manually trigger escalation check (also called by cron/scheduler)
router.post(
  '/check-escalations',
  requireAuth,
  requireRole(['Supervisor', 'Admin']),
  async (req, res) => {
    const count = await checkDowntimeEscalations(req.user!.tenantId);
    return res.status(200).json({ escalated: count });
  },
);

export default router;
