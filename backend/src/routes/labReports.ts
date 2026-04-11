import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { z } from 'zod';
import { submitLabReport, signoffLabReport } from '../services/labReportService.js';

const router = Router();

const submitSchema = z.object({
  batchId: z.string().min(1),
  fileHash: z.string().length(64),       // BLAKE3 hex
  fileUrl: z.string().url(),
  fileName: z.string().min(1).max(255),
  result: z.enum(['PENDING', 'PASS', 'FAIL']),
});

const signoffSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

// POST /api/v1/lab-reports
router.post(
  '/',
  requireAuth,
  requireRole(['Tech', 'Supervisor', 'Admin']),
  async (req, res) => {
    const parse = submitSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ message: 'Invalid body', errors: parse.error.flatten() });

    const data = parse.data;
    const result = await submitLabReport({
      tenantId: req.user!.tenantId,
      submittedBy: req.user!.id,
      batchId: data.batchId,
      fileHash: data.fileHash,
      fileUrl: data.fileUrl,
      fileName: data.fileName,
      result: data.result,
    });
    return res.status(result.status).json(result.body);
  }
);

// POST /api/v1/lab-reports/:reportId/signoff
router.post(
  '/:reportId/signoff',
  requireAuth,
  requireRole(['Supervisor', 'Admin']),
  async (req, res) => {
    const parse = signoffSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ message: 'Invalid body' });

    const result = await signoffLabReport({
      tenantId: req.user!.tenantId,
      labReportId: req.params.reportId,
      managerId: req.user!.id,
      notes: parse.data.notes,
    });
    return res.status(result.status).json(result.body);
  }
);

export default router;
