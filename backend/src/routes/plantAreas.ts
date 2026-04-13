import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPlantAreas, getPlantAreaDetail } from '../services/plantAreaService.js';

const router = Router();

/**
 * Plant Area Routes — Physical building layout
 *
 * Rutherfordton has 3 buildings:
 *  - Main Plant (MAIN)  — Core production: presses, mixers, mills
 *  - Shipping   (SHIP)  — Staging, packaging, loading docks
 *  - New Plant  (NEW)   — Expansion area with newer equipment
 *
 * Floor workers use this to scope their station dashboard to their building.
 */

// GET /api/v1/plant-areas
// List all plant areas with work center and equipment counts
router.get('/', requireAuth, async (req, res) => {
  const result = await getPlantAreas(req.user!.tenantId);
  return res.status(result.status).json(result.body);
});

// GET /api/v1/plant-areas/:code
// Get a plant area with its work centers and equipment
router.get('/:code', requireAuth, async (req, res) => {
  const result = await getPlantAreaDetail(req.user!.tenantId, req.params.code);
  return res.status(result.status).json(result.body);
});

export default router;
