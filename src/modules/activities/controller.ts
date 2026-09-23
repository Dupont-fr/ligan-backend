import type { Request, Response } from 'express';
import { AppError } from '../../middlewares/errorHandler.js';
import { Activity, toPublicActivity } from '../../models/Activity.js';
import { success } from '../../utils/ApiResponse.js';
import type { CreateActivityInput, ListActivitiesInput } from './validator.js';

export async function listActivities(req: Request, res: Response) {
  const { q, category } = (req.validQuery ?? {}) as ListActivitiesInput;

  const filter: Record<string, unknown> = {};
  if (q) {
    filter.$or = [
      { title: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
      { category: { $regex: q, $options: 'i' } },
    ];
  }
  if (category) {
    filter.category = { $regex: `^${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
  }

  const activities = await Activity.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('professionalId', 'firstName lastName');

  return success(res, { activities: activities.map((a) => toPublicActivity(a)) });
}

export async function listMyActivities(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentification requise', 401);
  }

  const activities = await Activity.find({ professionalId: userId })
    .sort({ createdAt: -1 })
    .populate('professionalId', 'firstName lastName');

  return success(res, { activities: activities.map((a) => toPublicActivity(a)) });
}

export async function createActivity(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentification requise', 401);
  }

  const { title, description, category, price, location } = req.validBody as CreateActivityInput;

  const activity = await Activity.create({
    professionalId: userId,
    title,
    description,
    category,
    ...(price ? { price } : {}),
    ...(location ? { location } : {}),
  });

  return success(res, { activity: toPublicActivity(activity) }, 201);
}

export async function deleteActivity(req: Request, res: Response) {
  const userId = req.user?.id;
  const { id } = req.validParams as { id: string };

  const activity = await Activity.findById(id);
  if (!activity) {
    throw new AppError('Activité introuvable', 404);
  }
  if (activity.professionalId.toString() !== userId) {
    throw new AppError('Vous ne pouvez supprimer que vos propres activités', 403);
  }

  await activity.deleteOne();
  return success(res, { message: 'Activité supprimée' });
}
