import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { z } from 'zod';
import {
  listOperators,
  getOperator,
  createOperator,
  updateOperator,
  deleteOperator,
  bulkImportOperators,
} from '../services/operatorService.js';

const router = Router();

/**
 * Operator Management Routes — Admin panel for managing operators
 *
 * CRUD operations + bulk import + badge provisioning.
 * All require Admin role.
 */

// ─── List Operators ───────────────────────────────────────────────────────────

router.get('/', requireAuth, requireRole(['Supervisor', 'Admin']), async (req, res) => {
  const result = await listOperators({
    search: req.query.search as string | undefined,
    isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
    page: parseInt(req.query.page as string) || 1,
    pageSize: parseInt(req.query.pageSize as string) || 50,
  });
  return res.status(result.status).json(result.body);
});

// ─── Get Operator ─────────────────────────────────────────────────────────────

router.get('/:id', requireAuth, requireRole(['Supervisor', 'Admin']), async (req, res) => {
  const result = await getOperator(req.params.id);
  return res.status(result.status).json(result.body);
});

// ─── Create Operator ──────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1).max(200),
  badgeId: z.string().min(1).max(50),
});

router.post('/', requireAuth, requireRole(['Admin']), async (req, res) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
  }

  const result = await createOperator(parse.data);
  return res.status(result.status).json(result.body);
});

// ─── Update Operator ──────────────────────────────────────────────────────────

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  badgeId: z.string().min(1).max(50).optional(),
  isActive: z.boolean().optional(),
});

router.put('/:id', requireAuth, requireRole(['Admin']), async (req, res) => {
  const parse = updateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
  }

  const result = await updateOperator(req.params.id, parse.data);
  return res.status(result.status).json(result.body);
});

// ─── Delete (Deactivate) Operator ─────────────────────────────────────────────

router.delete('/:id', requireAuth, requireRole(['Admin']), async (req, res) => {
  const result = await deleteOperator(req.params.id);
  return res.status(result.status).json(result.body);
});

// ─── Bulk Import ──────────────────────────────────────────────────────────────

const bulkSchema = z.object({
  operators: z.array(z.object({
    name: z.string().min(1),
    badgeId: z.string().min(1),
  })).min(1).max(500),
});

router.post('/bulk-import', requireAuth, requireRole(['Admin']), async (req, res) => {
  const parse = bulkSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
  }

  const result = await bulkImportOperators(parse.data.operators);
  return res.status(result.status).json(result.body);
});

export default router;
