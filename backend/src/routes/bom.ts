import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { z } from 'zod';
import {
  listBOMs,
  getBOM,
  createBOM,
  updateBOM,
  deleteBOM,
  bulkImportBOMs,
} from '../services/bomService.js';

const router = Router();

/**
 * BOM Management Routes — Bill of Materials CRUD + Bulk Import
 *
 * BOMs define the recipe/formula for producing materials, including:
 * - Input materials (BOMItems) with quantities
 * - Process steps (BOMSteps) with machine types and durations
 *
 * All routes require Admin role for writes, Supervisor+ for reads.
 */

// ─── List BOMs ────────────────────────────────────────────────────────────────

router.get('/', requireAuth, requireRole(['Supervisor', 'Admin']), async (req, res) => {
  const result = await listBOMs({
    materialId: req.query.materialId as string | undefined,
    isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
    page: parseInt(req.query.page as string) || 1,
    pageSize: parseInt(req.query.pageSize as string) || 50,
  });
  return res.status(result.status).json(result.body);
});

// ─── Get BOM ──────────────────────────────────────────────────────────────────

router.get('/:id', requireAuth, requireRole(['Supervisor', 'Admin']), async (req, res) => {
  const result = await getBOM(req.params.id);
  return res.status(result.status).json(result.body);
});

// ─── Create BOM ───────────────────────────────────────────────────────────────

const bomItemSchema = z.object({
  materialId: z.string().uuid(),
  quantity: z.number().positive(),
  uom: z.string().min(1).max(10),
  isOptional: z.boolean().optional(),
  condition: z.string().optional(),
});

const bomStepSchema = z.object({
  name: z.string().min(1).max(200),
  sequence: z.number().int().min(1),
  machineType: z.string().max(50).optional(),
  durationSec: z.number().int().positive().optional(),
  constraints: z.record(z.unknown()).optional(),
});

const createSchema = z.object({
  materialId: z.string().uuid(),
  version: z.number().int().positive().optional(),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime().optional(),
  items: z.array(bomItemSchema).min(1).max(100),
  steps: z.array(bomStepSchema).max(50).default([]),
});

router.post('/', requireAuth, requireRole(['Admin']), async (req, res) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
  }

  const result = await createBOM({
    materialId: parse.data.materialId,
    version: parse.data.version,
    validFrom: new Date(parse.data.validFrom),
    validTo: parse.data.validTo ? new Date(parse.data.validTo) : undefined,
    items: parse.data.items,
    steps: parse.data.steps,
  });

  return res.status(result.status).json(result.body);
});

// ─── Update BOM ───────────────────────────────────────────────────────────────

const updateSchema = z.object({
  isActive: z.boolean().optional(),
  validTo: z.string().datetime().optional(),
});

router.put('/:id', requireAuth, requireRole(['Admin']), async (req, res) => {
  const parse = updateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
  }

  const result = await updateBOM(req.params.id, {
    isActive: parse.data.isActive,
    validTo: parse.data.validTo ? new Date(parse.data.validTo) : undefined,
  });

  return res.status(result.status).json(result.body);
});

// ─── Delete BOM ───────────────────────────────────────────────────────────────

router.delete('/:id', requireAuth, requireRole(['Admin']), async (req, res) => {
  const result = await deleteBOM(req.params.id);
  return res.status(result.status).json(result.body);
});

// ─── Bulk Import ──────────────────────────────────────────────────────────────

const bulkItemSchema = z.object({
  materialNumber: z.string().min(1),
  quantity: z.number().positive(),
  uom: z.string().min(1).max(10),
  isOptional: z.boolean().optional(),
});

const bulkStepSchema = z.object({
  name: z.string().min(1).max(200),
  sequence: z.number().int().min(1),
  machineType: z.string().max(50).optional(),
  durationSec: z.number().int().positive().optional(),
});

const bulkBOMSchema = z.object({
  outputMaterialNumber: z.string().min(1),
  version: z.number().int().positive().optional(),
  validFrom: z.string(),
  validTo: z.string().optional(),
  items: z.array(bulkItemSchema).min(1),
  steps: z.array(bulkStepSchema).optional(),
});

const bulkSchema = z.object({
  boms: z.array(bulkBOMSchema).min(1).max(100),
});

router.post('/bulk-import', requireAuth, requireRole(['Admin']), async (req, res) => {
  const parse = bulkSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
  }

  // Get tenant from authenticated user
  const tenantId = (req as unknown as { user: { tenantId: string } }).user.tenantId;

  const result = await bulkImportBOMs(parse.data.boms, tenantId);
  return res.status(result.status).json(result.body);
});

export default router;
