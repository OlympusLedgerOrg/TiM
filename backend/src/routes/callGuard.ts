import { Router } from 'express';
import { z } from 'zod';
import { requireCallGuardKey } from '../middleware/integrationAuth.js';
import { ingestCallGuardCall } from '../services/fieldServiceService.js';
import { AppError } from '../errors/AppError.js';

const router = Router();

const serviceTypes = [
  'SEPTIC_PUMPING',
  'GREASE_TRAP',
  'HOLDING_TANK',
  'PORTABLE_RESTROOM',
  'DRAIN_CLEANING',
  'JETTING',
  'INSPECTION',
  'REPAIR',
  'EMERGENCY_RESPONSE',
  'OTHER',
] as const;

const intakeSchema = z.object({
  externalCallId: z.string().min(1).max(200),
  callerPhone: z.string().min(3).max(50),
  callerName: z.string().trim().min(1).max(200).optional(),
  summary: z.string().trim().min(3).max(5000),
  transcript: z.string().max(100_000).optional(),
  priority: z.enum(['ROUTINE', 'PRIORITY', 'URGENT', 'EMERGENCY']).default('ROUTINE'),
  requestedService: z.enum(serviceTypes).optional(),
  estimatedGallons: z.number().int().min(0).max(20_000).optional(),
  rawPayload: z.record(z.unknown()).optional(),
});

router.post('/calls', requireCallGuardKey, async (req, res) => {
  const parsed = intakeSchema.safeParse(req.body);
  if (!parsed.success) {
    throw AppError.badRequest(parsed.error.issues.map((issue) => issue.message).join('; '), 'INVALID_CALL_INTAKE');
  }

  const tenantId = process.env.CALLGUARD_TENANT_ID;
  if (!tenantId) {
    throw new AppError('Call Guard tenant is not configured', 503, 'CALLGUARD_TENANT_NOT_CONFIGURED');
  }

  const result = await ingestCallGuardCall({
    tenantId,
    ...parsed.data,
  });

  return res.status(result.duplicate ? 200 : 201).json(result);
});

export default router;
