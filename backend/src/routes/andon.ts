import { Router } from 'express';
import { z } from 'zod';
import { getAndonBoard } from '../services/andonService.js';

const router = Router();

/**
 * Andon Board Routes — Public read-only plant floor visibility
 *
 * These endpoints are intentionally unauthenticated so that wall-mounted
 * TVs and kiosk displays can show live equipment status without login.
 *
 * GET /api/v1/andon           → all equipment across all plant areas
 * GET /api/v1/andon/:areaCode → equipment in a specific plant area
 */

const tenantSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);

// GET /api/v1/andon?tenant=<tenantId>
// GET /api/v1/andon/:areaCode?tenant=<tenantId>
router.get('/:areaCode?', async (req, res) => {
  const rawTenant = (req.query.tenant as string) || 'default';
  const tenantParse = tenantSchema.safeParse(rawTenant);
  if (!tenantParse.success) {
    return res.status(400).json({ message: 'Invalid tenant parameter' });
  }
  const tenantId = tenantParse.data;
  const areaCode = req.params.areaCode || undefined;
  const result = await getAndonBoard(tenantId, areaCode);
  return res.status(result.status).json(result.body);
});

export default router;
