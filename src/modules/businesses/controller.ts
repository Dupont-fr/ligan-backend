import type { Request, Response } from 'express';
import { AppError } from '../../middlewares/errorHandler.js';
import { Activity, toPublicActivity } from '../../models/Activity.js';
import { User } from '../../models/User.js';
import { success } from '../../utils/ApiResponse.js';
import type { BusinessSlugParam } from './validator.js';

/** Fiche publique d'une activité (Sprint 4) : activité + professionnel. */
export async function getBusiness(req: Request, res: Response) {
  const { slug } = req.validParams as BusinessSlugParam;

  const activity = await Activity.findOne({ slug });
  if (!activity) {
    throw new AppError('Fiche introuvable', 404);
  }

  const pro = await User.findById(activity.professionalId).select('firstName lastName isVerified createdAt');
  if (!pro) {
    throw new AppError('Fiche introuvable', 404);
  }

  return success(res, {
    activity: toPublicActivity(activity),
    professional: {
      id: String(pro._id),
      firstName: pro.firstName,
      lastName: pro.lastName,
      isVerified: Boolean(pro.isVerified),
      memberSince: pro.createdAt ?? null,
    },
  });
}
