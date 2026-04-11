import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getQueueSnapshot } from '../services/queueService.js';

const router = Router();

// GET /api/v1/queue — current queue state for the caller's tenant
router.get('/', requireAuth, async (req, res) => {
  const snapshot = await getQueueSnapshot(req.user!.tenantId);
  return res.json({ workCenters: snapshot, generatedAt: new Date().toISOString() });
});

export default router;
