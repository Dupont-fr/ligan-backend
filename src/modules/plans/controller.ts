import type { Request, Response } from 'express';
import { Plan, toPublicPlan } from '../../models/Plan.js';
import { success } from '../../utils/ApiResponse.js';

/** Catalogue public des plans — prix toujours lus en base, jamais codés en dur côté client. */
export async function listPlans(_req: Request, res: Response) {
  const plans = await Plan.find({ isActive: true }).sort({ order: 1 });
  return success(res, { plans: plans.map(toPublicPlan) });
}
