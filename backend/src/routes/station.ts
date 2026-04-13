import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { z } from 'zod';
import {
  getStationWorkOrder,
  getStationOnHand,
  getStationInbound,
  consumeMaterial,
  recordProduction,
} from '../services/stationService.js';

const router = Router();

/**
 * Station Routes — Operator-facing API
 *
 * These endpoints power the station dashboard — the primary interface
 * for shop floor workers. Designed to be simple enough that a worker
 * wearing gloves can use them on a tablet.
 *
 * All endpoints require the `workCenter` query parameter, which maps to
 * the work center code (e.g., "MIX-01", "EXT-01").
 */

// GET /api/v1/station/work-order?workCenter=MIX-01
// Returns the active work order at a station with BOM components and consumption progress
router.get('/work-order', requireAuth, async (req, res) => {
  const workCenterCode = req.query.workCenter as string;
  if (!workCenterCode) {
    return res.status(400).json({ message: 'workCenter query parameter required' });
  }

  const result = await getStationWorkOrder(req.user!.tenantId, workCenterCode);
  return res.status(result.status).json(result.body);
});

// GET /api/v1/station/on-hand?workCenter=MIX-01
// Returns all lots currently at the station
router.get('/on-hand', requireAuth, async (req, res) => {
  const workCenterCode = req.query.workCenter as string;
  if (!workCenterCode) {
    return res.status(400).json({ message: 'workCenter query parameter required' });
  }

  const result = await getStationOnHand(req.user!.tenantId, workCenterCode);
  return res.status(result.status).json(result.body);
});

// GET /api/v1/station/inbound?workCenter=MIX-01
// Returns transfers heading to this station
router.get('/inbound', requireAuth, async (req, res) => {
  const workCenterCode = req.query.workCenter as string;
  if (!workCenterCode) {
    return res.status(400).json({ message: 'workCenter query parameter required' });
  }

  const result = await getStationInbound(req.user!.tenantId, workCenterCode);
  return res.status(result.status).json(result.body);
});

// POST /api/v1/station/consume
// Record material consumption — what workers do when they weigh and add materials
const consumeSchema = z.object({
  workOrderId: z.string().min(1),
  lotId: z.string().min(1),
  quantity: z.number().positive(),
  operatorId: z.string().optional(),
});

router.post(
  '/consume',
  requireAuth,
  requireRole(['Tech', 'Supervisor', 'Admin']),
  async (req, res) => {
    const parse = consumeSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
    }

    const result = await consumeMaterial({
      tenantId: req.user!.tenantId,
      ...parse.data,
    });
    return res.status(result.status).json(result.body);
  }
);

// POST /api/v1/station/produce
// Record production output — when the batch is done and worker weighs the result
const produceSchema = z.object({
  workOrderId: z.string().min(1),
  quantity: z.number().positive(),
  uom: z.string().min(1).max(10),
  operatorId: z.string().optional(),
});

router.post(
  '/produce',
  requireAuth,
  requireRole(['Tech', 'Supervisor', 'Admin']),
  async (req, res) => {
    const parse = produceSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
    }

    const result = await recordProduction({
      tenantId: req.user!.tenantId,
      ...parse.data,
    });
    return res.status(result.status).json(result.body);
  }
);

export default router;
