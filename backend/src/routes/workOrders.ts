import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { completeStepController } from '../controllers/stepController.js';

const router = Router();

router.post(
  '/:workOrderId/steps/:stepId/complete',
  requireAuth,
  requireRole(['Tech', 'Supervisor']),
  completeStepController
);

export default router;
