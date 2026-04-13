import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { z } from 'zod';
import {
  allocateMaterial,
  consumeReservation,
  releaseReservation,
  simulateAllocation,
} from '../services/allocationService.js';

const router = Router();

/**
 * Allocation Routes — Reservation & auto-allocation API
 *
 * POST /allocate   — allocate material for a work order (FIFO or FEFO)
 * POST /consume    — consume a reservation (production step executes)
 * POST /release    — cancel/release a reservation
 * POST /simulate   — dry-run allocation for planning
 */

// ─── Schemas ──────────────────────────────────────────────────────────────────

const allocateSchema = z.object({
  materialId: z.string().min(1),
  requiredQty: z.number().positive(),
  strategy: z.enum(['FIFO', 'FEFO']),
  workOrderId: z.string().min(1),
});

const consumeSchema = z.object({
  reservationId: z.string().min(1),
});

const releaseSchema = z.object({
  reservationId: z.string().min(1),
});

const simulateSchema = z.object({
  materialId: z.string().min(1),
  requiredQty: z.number().positive(),
  strategy: z.enum(['FIFO', 'FEFO']),
});

// ─── Endpoints ────────────────────────────────────────────────────────────────

// POST /api/v1/allocation/allocate
router.post(
  '/allocate',
  requireAuth,
  requireRole(['Supervisor', 'Admin']),
  async (req, res) => {
    const parse = allocateSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
    }

    const result = await allocateMaterial(parse.data);
    const status = result.success ? 201 : 200;
    return res.status(status).json(result);
  },
);

// POST /api/v1/allocation/consume
router.post(
  '/consume',
  requireAuth,
  requireRole(['Tech', 'Supervisor', 'Admin']),
  async (req, res) => {
    const parse = consumeSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
    }

    const result = await consumeReservation(parse.data.reservationId);
    if (!result.success) {
      return res.status(404).json(result);
    }
    return res.status(200).json(result);
  },
);

// POST /api/v1/allocation/release
router.post(
  '/release',
  requireAuth,
  requireRole(['Supervisor', 'Admin']),
  async (req, res) => {
    const parse = releaseSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
    }

    const result = await releaseReservation(parse.data.reservationId);
    if (!result.success) {
      return res.status(404).json(result);
    }
    return res.status(200).json(result);
  },
);

// POST /api/v1/allocation/simulate
router.post(
  '/simulate',
  requireAuth,
  requireRole(['Supervisor', 'Admin']),
  async (req, res) => {
    const parse = simulateSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
    }

    const result = await simulateAllocation(parse.data);
    return res.status(200).json(result);
  },
);

export default router;
