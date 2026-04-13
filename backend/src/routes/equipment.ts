import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { z } from 'zod';
import {
  getEquipmentByWorkCenter,
  updateEquipmentStatus,
  logDowntimeEvent,
  closeDowntimeEvent,
  getDowntimeHistory,
  calculateOee,
  getScrapReasons,
  getShiftAssignments,
  clockIn,
} from '../services/equipmentService.js';

const router = Router();

/**
 * Equipment Routes — Floor-worker-facing API
 *
 * These endpoints give press operators, mixer operators, and material
 * handlers visibility into equipment state, downtime, and OEE —
 * the stuff Axxos does on separate terminals.
 *
 * Rutherfordton has 3 plant areas: Main, Shipping, New Plant.
 * Equipment and work centers belong to a plant area.
 *
 * All endpoints require JWT auth. Write operations require Tech role or above.
 */

// ─── Equipment State ──────────────────────────────────────────────────────────

// GET /api/v1/equipment?workCenter=MIX-01
// Returns all equipment at a station with current state + active downtime
router.get('/', requireAuth, async (req, res) => {
  const workCenterCode = req.query.workCenter as string;
  if (!workCenterCode) {
    return res.status(400).json({ message: 'workCenter query parameter required' });
  }

  const result = await getEquipmentByWorkCenter(req.user!.tenantId, workCenterCode);
  return res.status(result.status).json(result.body);
});

// PUT /api/v1/equipment/:id/status
// Change equipment status (operator taps RUNNING / DOWN / IDLE / etc.)
const statusSchema = z.object({
  status: z.enum(['RUNNING', 'IDLE', 'DOWN', 'MAINTENANCE', 'SETUP', 'CHANGEOVER']),
  operatorId: z.string().optional(),
});

router.put(
  '/:id/status',
  requireAuth,
  requireRole(['Tech', 'Supervisor', 'Admin']),
  async (req, res) => {
    const parse = statusSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
    }

    const result = await updateEquipmentStatus({
      tenantId: req.user!.tenantId,
      equipmentId: req.params.id,
      ...parse.data,
    });
    return res.status(result.status).json(result.body);
  },
);

// ─── Downtime ─────────────────────────────────────────────────────────────────

// POST /api/v1/equipment/:id/downtime
// Log a downtime event (operator enters reason when press goes down)
const downtimeSchema = z.object({
  category: z.enum(['PLANNED', 'UNPLANNED', 'CHANGEOVER', 'MATERIAL_WAIT', 'QUALITY_HOLD', 'MAINTENANCE']),
  reasonCode: z.string().min(1).max(50),
  reasonText: z.string().max(500).optional(),
  reportedById: z.string().optional(),
  workOrderId: z.string().optional(),
});

router.post(
  '/:id/downtime',
  requireAuth,
  requireRole(['Tech', 'Supervisor', 'Admin']),
  async (req, res) => {
    const parse = downtimeSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
    }

    const result = await logDowntimeEvent({
      tenantId: req.user!.tenantId,
      equipmentId: req.params.id,
      ...parse.data,
    });
    return res.status(result.status).json(result.body);
  },
);

// PUT /api/v1/equipment/downtime/:eventId/close
// Close a downtime event (operator taps "machine back up")
router.put(
  '/downtime/:eventId/close',
  requireAuth,
  requireRole(['Tech', 'Supervisor', 'Admin']),
  async (req, res) => {
    const result = await closeDowntimeEvent({
      tenantId: req.user!.tenantId,
      eventId: req.params.eventId,
    });
    return res.status(result.status).json(result.body);
  },
);

// GET /api/v1/equipment/:id/downtime
// Get downtime history (supervisor reviewing shift)
router.get('/:id/downtime', requireAuth, async (req, res) => {
  const hoursBack = parseInt(req.query.hours as string) || 24;
  const result = await getDowntimeHistory(req.user!.tenantId, req.params.id, hoursBack);
  return res.status(result.status).json(result.body);
});

// ─── OEE ──────────────────────────────────────────────────────────────────────

// GET /api/v1/equipment/:id/oee?start=...&end=...
// Calculate OEE for a time period
router.get('/:id/oee', requireAuth, async (req, res) => {
  const start = req.query.start ? new Date(req.query.start as string) : new Date(Date.now() - 8 * 60 * 60 * 1000); // Default: last 8 hours (1 shift)
  const end = req.query.end ? new Date(req.query.end as string) : new Date();

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ message: 'Invalid date range' });
  }

  const result = await calculateOee(req.user!.tenantId, req.params.id, start, end);
  return res.status(result.status).json(result.body);
});

// ─── Scrap Reason Codes ───────────────────────────────────────────────────────

// GET /api/v1/equipment/scrap-reasons
// Dropdown data for scrap entry — standard reason codes for Rutherfordton
router.get('/scrap-reasons', requireAuth, async (req, res) => {
  const result = await getScrapReasons(req.user!.tenantId);
  return res.status(result.status).json(result.body);
});

// ─── Shifts ───────────────────────────────────────────────────────────────────

// GET /api/v1/equipment/shifts?date=2026-04-13&shift=FIRST
// Who's on which station this shift
router.get('/shifts', requireAuth, async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const shift = req.query.shift as string | undefined;
  const result = await getShiftAssignments(req.user!.tenantId, date, shift);
  return res.status(result.status).json(result.body);
});

// POST /api/v1/equipment/shifts/clock-in
// Badge scan at shift start
const clockInSchema = z.object({
  operatorId: z.string().min(1),
  shift: z.enum(['FIRST', 'SECOND', 'THIRD']),
  workCenterCode: z.string().optional(),
});

router.post(
  '/shifts/clock-in',
  requireAuth,
  requireRole(['Tech', 'Supervisor', 'Admin']),
  async (req, res) => {
    const parse = clockInSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
    }

    const result = await clockIn({
      tenantId: req.user!.tenantId,
      ...parse.data,
    });
    return res.status(result.status).json(result.body);
  },
);

export default router;
