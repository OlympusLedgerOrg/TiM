import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { z } from 'zod';
import {
  getSAPMaterials,
  getSAPBatches,
  getSAPMovements,
  getSAPPlantInfo,
  syncMaterialFromSAP,
} from '../services/sapIntegrationService.js';

const router = Router();

/**
 * SAP Integration Routes
 * OData v4-compatible endpoints for SAP ERP integration
 */

// GET /api/v1/sap/plant - Get plant information
router.get('/plant', requireAuth, async (req, res) => {
  const result = await getSAPPlantInfo(req.user!.tenantId);
  return res.status(result.status).json(result.body);
});

// GET /api/v1/sap/materials - Get materials in SAP format
router.get('/materials', requireAuth, async (req, res) => {
  const materials = await getSAPMaterials(req.user!.tenantId);
  return res.json({
    '@odata.context': `${req.protocol}://${req.get('host')}/api/v1/sap/$metadata#Materials`,
    value: materials,
  });
});

// GET /api/v1/sap/batches - Get production batches in SAP format
router.get('/batches', requireAuth, async (req, res) => {
  const { status, workCenter } = req.query;
  
  const batches = await getSAPBatches(req.user!.tenantId, {
    status: status as string | undefined,
    workCenterCode: workCenter as string | undefined,
  });
  
  return res.json({
    '@odata.context': `${req.protocol}://${req.get('host')}/api/v1/sap/$metadata#Batches`,
    value: batches,
  });
});

// GET /api/v1/sap/movements - Get goods movements in SAP format
router.get('/movements', requireAuth, async (req, res) => {
  const { fromDate } = req.query;
  
  let dateFilter: Date | undefined;
  if (fromDate && typeof fromDate === 'string') {
    dateFilter = new Date(fromDate);
    if (isNaN(dateFilter.getTime())) {
      return res.status(400).json({ message: 'Invalid fromDate format. Use ISO 8601 format.' });
    }
  }
  
  const movements = await getSAPMovements(req.user!.tenantId, dateFilter);
  
  return res.json({
    '@odata.context': `${req.protocol}://${req.get('host')}/api/v1/sap/$metadata#Movements`,
    value: movements,
  });
});

// POST /api/v1/sap/materials/sync - Sync material from SAP
const materialSyncSchema = z.object({
  materialNumber: z.string().min(1),
  description: z.string().min(1),
  unitOfMeasure: z.string().min(1).max(10),
});

router.post(
  '/materials/sync',
  requireAuth,
  requireRole(['Admin', 'Supervisor']),
  async (req, res) => {
    const parse = materialSyncSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({
        message: 'Invalid request body',
        errors: parse.error.flatten(),
      });
    }

    const result = await syncMaterialFromSAP(req.user!.tenantId, parse.data);
    return res.status(result.status).json(result.body);
  }
);

export default router;
