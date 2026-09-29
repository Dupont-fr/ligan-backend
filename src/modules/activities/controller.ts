import type { Request, Response } from 'express';
import { AppError } from '../../middlewares/errorHandler.js';
import { Activity, generateUniqueSlug, toPublicActivity } from '../../models/Activity.js';
import { success } from '../../utils/ApiResponse.js';
import { deletePhotoFile, filenameFromUrl } from '../../utils/photos.js';
import type { ActivityBodyInput, ListActivitiesInput } from './validator.js';

async function findOwnActivity(id: string, userId: string) {
  const activity = await Activity.findById(id);
  if (!activity) {
    throw new AppError('Activité introuvable', 404);
  }
  if (activity.professionalId.toString() !== userId) {
    throw new AppError('Vous ne pouvez modifier que vos propres activités', 403);
  }
  return activity;
}

export async function listActivities(req: Request, res: Response) {
  const { q, category } = (req.validQuery ?? {}) as ListActivitiesInput;

  const filter: Record<string, unknown> = {};
  if (q) {
    filter.$or = [
      { title: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
      { category: { $regex: q, $options: 'i' } },
      { 'address.city': { $regex: q, $options: 'i' } },
      { location: { $regex: q, $options: 'i' } },
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

function buildFields(input: ActivityBodyInput) {
  return {
    title: input.title,
    description: input.description,
    category: input.category,
    price: input.price || undefined,
    location: input.location || undefined,
    services: input.services.map((s) => ({
      name: s.name,
      ...(s.price ? { price: s.price } : {}),
    })),
    contacts: {
      phone: input.contacts.phone,
      ...(input.contacts.whatsapp ? { whatsapp: input.contacts.whatsapp } : {}),
      ...(input.contacts.email ? { email: input.contacts.email } : {}),
    },
    openingHours: input.openingHours.map((h) => ({
      day: h.day,
      open: h.open,
      close: h.close,
      closed: h.closed,
    })),
    address: {
      city: input.address.city,
      ...(input.address.district ? { district: input.address.district } : {}),
      ...(input.address.street ? { street: input.address.street } : {}),
    },
    photos: input.photos,
  };
}

export async function createActivity(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentification requise', 401);
  }

  const input = req.validBody as ActivityBodyInput;
  const activity = await Activity.create({
    professionalId: userId,
    slug: await generateUniqueSlug(input.title),
    ...buildFields(input),
  });

  return success(res, { activity: toPublicActivity(activity) }, 201);
}

export async function updateActivity(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentification requise', 401);
  }

  const { id } = req.validParams as { id: string };
  const input = req.validBody as ActivityBodyInput;
  const activity = await findOwnActivity(id, userId);

  const nextPhotos = input.photos;
  const removed = (activity.photos ?? []).filter((url) => !nextPhotos.includes(url));
  for (const url of removed) {
    const filename = filenameFromUrl(url);
    if (filename) {
      await deletePhotoFile(filename);
    }
  }

  Object.assign(activity, buildFields(input));
  if (!activity.slug) {
    activity.slug = await generateUniqueSlug(input.title);
  }
  await activity.save();

  return success(res, { activity: toPublicActivity(activity) });
}

export async function deleteActivity(req: Request, res: Response) {
  const userId = req.user?.id;
  const { id } = req.validParams as { id: string };

  const activity = await findOwnActivity(id, userId ?? '');

  for (const url of activity.photos ?? []) {
    const filename = filenameFromUrl(url);
    if (filename) {
      await deletePhotoFile(filename);
    }
  }

  await activity.deleteOne();
  return success(res, { message: 'Activité supprimée' });
}
