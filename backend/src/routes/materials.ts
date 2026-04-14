import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { z } from 'zod';
import {
  listMaterials,
  getMaterial,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  bulkImportMaterials,
} from '../services/materialService.js';

const router = Router();

/**
 * Material Management Routes — CRUD for materials/specs + Bulk Import
 *
 * Materials are the master data for components, finished goods,
 * and raw materials. Supports en masse ID creation via bulk import.
 *
 * All routes require Admin role for writes, Supervisor+ for reads.
 */

// ─── List Materials ───────────────────────────────────────────────────────────

router.get('/', requireAuth, requireRole(['Supervisor', 'Admin']), async (req, res) => {
  const tenantId = (req as unknown as { user: { tenantId: string } }).user.tenantId;

  const result = await listMaterials({
    tenantId,
    search: req.query.search as string | undefined,
    isBatchTracked: req.query.isBatchTracked !== undefined
      ? req.query.isBatchTracked === 'true'
      : undefined,
    page: parseInt(req.query.page as string) || 1,
    pageSize: parseInt(req.query.pageSize as string) || 50,
  });

  return res.status(result.status).json(result.body);
});

// ─── Get Material ─────────────────────────────────────────────────────────────

router.get('/:id', requireAuth, requireRole(['Supervisor', 'Admin']), async (req, res) => {
  const result = await getMaterial(req.params.id);
  return res.status(result.status).json(result.body);
});

// ─── Create Material ──────────────────────────────────────────────────────────

const createSchema = z.object({
  sapMaterialNumber: z.string().min(1).max(50).optional(),
  description: z.string().min(1).max(500),
  name: z.string().min(1).max(200).optional(),
  unitOfMeasure: z.string().min(1).max(10).optional(),
  isBatchTracked: z.boolean().optional(),
});

router.post('/', requireAuth, requireRole(['Admin']), async (req, res) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
  }

  const tenantId = (req as unknown as { user: { tenantId: string } }).user.tenantId;

  const result = await createMaterial({
    ...parse.data,
    tenantId,
  });

  return res.status(result.status).json(result.body);
});

// ─── Update Material ──────────────────────────────────────────────────────────

const updateSchema = z.object({
  sapMaterialNumber: z.string().min(1).max(50).optional(),
  description: z.string().min(1).max(500).optional(),
  name: z.string().min(1).max(200).optional(),
  unitOfMeasure: z.string().min(1).max(10).optional(),
  isBatchTracked: z.boolean().optional(),
});

router.put('/:id', requireAuth, requireRole(['Admin']), async (req, res) => {
  const parse = updateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
  }

  const tenantId = (req as unknown as { user: { tenantId: string } }).user.tenantId;

  const result = await updateMaterial(req.params.id, parse.data, tenantId);
  return res.status(result.status).json(result.body);
});

// ─── Delete Material ──────────────────────────────────────────────────────────

router.delete('/:id', requireAuth, requireRole(['Admin']), async (req, res) => {
  const result = await deleteMaterial(req.params.id);
  return res.status(result.status).json(result.body);
});

// ─── Bulk Import Materials ────────────────────────────────────────────────────

const bulkMaterialSchema = z.object({
  sapMaterialNumber: z.string().min(1).max(50),
  description: z.string().min(1).max(500),
  name: z.string().min(1).max(200).optional(),
  unitOfMeasure: z.string().min(1).max(10).optional(),
  isBatchTracked: z.boolean().optional(),
});

const bulkSchema = z.object({
  materials: z.array(bulkMaterialSchema).min(1).max(500),
});

/**
 * POST /api/v1/materials/bulk-import
 *
 * Bulk import materials from CSV/JSON. Supports en masse ID creation.
 * If a material already exists (by SAP number), it will be updated.
 *
 * Example body:
 * {
 *   "materials": [
 *     { "sapMaterialNumber": "MAT001", "description": "Raw Rubber", "unitOfMeasure": "KG" },
 *     { "sapMaterialNumber": "MAT002", "description": "Carbon Black", "unitOfMeasure": "KG" }
 *   ]
 * }
 */
router.post('/bulk-import', requireAuth, requireRole(['Admin']), async (req, res) => {
  const parse = bulkSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });
  }

  const tenantId = (req as unknown as { user: { tenantId: string } }).user.tenantId;

  const result = await bulkImportMaterials(parse.data.materials, tenantId);
  return res.status(result.status).json(result.body);
});

export default router;
