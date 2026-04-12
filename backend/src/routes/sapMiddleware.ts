import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { z } from 'zod';
import {
  getMiddlewareConfig,
  testMiddlewareConnection,
  batchToIDoc,
  movementToIDoc,
  renderIDocXml,
} from '../services/sapMiddlewareService.js';

const router = Router();

/**
 * SAP Middleware Routes
 * PI/PO and Cloud Integration management endpoints
 */

// GET /api/v1/sap/middleware/config - Get middleware configuration
router.get('/config', requireAuth, requireRole(['Admin', 'Supervisor']), async (req, res) => {
  const result = await getMiddlewareConfig(req.user!.tenantId);
  return res.status(result.status).json(result.body);
});

// GET /api/v1/sap/middleware/health - Test middleware connectivity
router.get('/health', requireAuth, requireRole(['Admin']), async (req, res) => {
  const result = await testMiddlewareConnection();
  return res.status(result.status).json(result.body);
});

// GET /api/v1/sap/middleware/idoc/batch/:batchId - Generate IDoc for a batch
const batchIdSchema = z.object({ batchId: z.string().min(1) });

router.get('/idoc/batch/:batchId', requireAuth, requireRole(['Admin', 'Supervisor']), async (req, res) => {
  const parse = batchIdSchema.safeParse(req.params);
  if (!parse.success) {
    return res.status(400).json({ message: 'Invalid batch ID' });
  }
  const result = await batchToIDoc(req.user!.tenantId, parse.data.batchId);
  return res.status(result.status).json(result.body);
});

// GET /api/v1/sap/middleware/idoc/batch/:batchId/xml - Generate IDoc XML for a batch
router.get('/idoc/batch/:batchId/xml', requireAuth, requireRole(['Admin', 'Supervisor']), async (req, res) => {
  const parse = batchIdSchema.safeParse(req.params);
  if (!parse.success) {
    return res.status(400).json({ message: 'Invalid batch ID' });
  }
  const result = await batchToIDoc(req.user!.tenantId, parse.data.batchId);
  if (result.status !== 200) {
    return res.status(result.status).json(result.body);
  }
  const body = result.body as { idoc: any };
  const xml = renderIDocXml(body.idoc);
  res.setHeader('Content-Type', 'application/xml');
  return res.status(200).send(xml);
});

// GET /api/v1/sap/middleware/idoc/movement/:movementId - Generate IDoc for a movement
const movementIdSchema = z.object({ movementId: z.string().min(1) });

router.get('/idoc/movement/:movementId', requireAuth, requireRole(['Admin', 'Supervisor']), async (req, res) => {
  const parse = movementIdSchema.safeParse(req.params);
  if (!parse.success) {
    return res.status(400).json({ message: 'Invalid movement ID' });
  }
  const result = await movementToIDoc(req.user!.tenantId, parse.data.movementId);
  return res.status(result.status).json(result.body);
});

// GET /api/v1/sap/middleware/idoc/movement/:movementId/xml - Generate IDoc XML for a movement
router.get('/idoc/movement/:movementId/xml', requireAuth, requireRole(['Admin', 'Supervisor']), async (req, res) => {
  const parse = movementIdSchema.safeParse(req.params);
  if (!parse.success) {
    return res.status(400).json({ message: 'Invalid movement ID' });
  }
  const result = await movementToIDoc(req.user!.tenantId, parse.data.movementId);
  if (result.status !== 200) {
    return res.status(result.status).json(result.body);
  }
  const body = result.body as { idoc: any };
  const xml = renderIDocXml(body.idoc);
  res.setHeader('Content-Type', 'application/xml');
  return res.status(200).send(xml);
});

export default router;
