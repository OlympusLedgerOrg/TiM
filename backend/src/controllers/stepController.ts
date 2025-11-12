import { Request, Response } from 'express';
import { z } from 'zod';
import { completeStep } from '../services/stepService.js';

const bodySchema = z.object({ notes: z.string().trim().max(5000).optional() });

export async function completeStepController(req: Request, res: Response) {
  const parse = bodySchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ message: 'Invalid body' });

  const result = await completeStep({
    workOrderId: req.params.workOrderId,
    stepId: req.params.stepId,
    notes: parse.data.notes,
    actorUserId: req.user!.id
  });

  return res.status(result.status).json(result.body);
}
