import { Router } from 'express';
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

// GET /api/v1/andon?tenant=<tenantId>
// GET /api/v1/andon/:areaCode?tenant=<tenantId>
router.get('/:areaCode?', async (req, res) => {
  const tenantId = (req.query.tenant as string) || 'default';
  const areaCode = req.params.areaCode || undefined;
  const result = await getAndonBoard(tenantId, areaCode);
  return res.status(result.status).json(result.body);
});

export default router;
