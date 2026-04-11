import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { z } from 'zod';
import { logMovement } from '../services/movementService.js';

const router = Router();

const schema = z.object({
  batchId: z.string().min(1),
  fromWorkCenterId: z.string().min(1),
  toWorkCenterId: z.string().min(1),
  quantity: z.number().positive(),
  notes: z.string().trim().max(2000).optional(),
});

// POST /api/v1/movements
router.post('/', requireAuth, requireRole(['Tech', 'Supervisor', 'Admin']), async (req, res) => {
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });

  const result = await logMovement({
    tenantId: req.user!.tenantId,
    movedByUserId: req.user!.id,
    ...parse.data,
  });
  return res.status(result.status).json(result.body);
});

export default router;
