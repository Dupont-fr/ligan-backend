import type { Request, Response } from 'express';
import { AppError } from '../../middlewares/errorHandler.js';
import { Activity, generateUniqueSlug, toPublicActivity } from '../../models/Activity.js';
import { Subscription } from '../../models/Subscription.js';
import { User } from '../../models/User.js';
import { success } from '../../utils/ApiResponse.js';
import { deletePhotoFile, filenameFromUrl } from '../../utils/photos.js';
import { resolvePlan } from '../../services/payments/index.js';
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

  const filter: Record<string, unknown> = { status: 'APPROVED' };
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
    ...(typeof input.latitude === 'number' && typeof input.longitude === 'number'
      ? { geo: { type: 'Point', coordinates: [input.longitude, input.latitude] } }
      : { geo: undefined }),
  };
}

export async function createActivity(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentification requise', 401);
  }

  const user = await User.findById(userId).select('role');
  let planCode: 'FREE' | 'PRO' | 'PREMIUM' = user?.role === 'PROFESSIONAL' ? 'PRO' : 'FREE';

  try {
    const resolved = await resolvePlan(userId);
    if (resolved?.code === 'PRO') planCode = 'PRO';
    else if (resolved?.code === 'PREMIUM') planCode = 'PREMIUM';
    else if (resolved?.code === 'FREE') {
      if (user?.role === 'PROFESSIONAL') {
        planCode = 'PRO';
      } else {
        planCode = 'FREE';
      }
    }
  } catch {
    if (user?.role !== 'PROFESSIONAL') planCode = 'FREE';
    else planCode = 'PRO';
  }

  const activeSub = await Subscription.findOne({ userId, status: 'ACTIVE' })
    .populate('planId')
    .sort({ createdAt: -1 });
  const subPlanCode = (activeSub?.planId as any)?.code;
  if (subPlanCode === 'PREMIUM') planCode = 'PREMIUM';
  else if (subPlanCode === 'PRO') planCode = 'PRO';
  else if (subPlanCode === 'FREE') {
    if (user?.role !== 'PROFESSIONAL') planCode = 'FREE';
  }

  const createdViaAi = (req.body as any)?.createdViaAi === true || (req.body as any)?.createdViaAi === 'true';
  if (planCode === 'FREE') {
    const count = await Activity.countDocuments({ professionalId: userId });
    if (createdViaAi) {
      const aiCount = await Activity.countDocuments({ professionalId: userId, createdViaAi: true });
      if (aiCount >= 2) {
        throw new AppError(
          "Vous avez atteint la limite de 2 activités gratuites avec l'IA. Passez en Pro ou Premium pour continuer.",
          403,
        );
      }
    } else if (count >= 2) {
      throw new AppError(
        "Vous avez atteint la limite de 2 activités gratuites. Passez en Pro ou Premium pour créer plus d'activités.",
        403,
      );
    }
  }

  const input = req.validBody as ActivityBodyInput;
  const activity = await Activity.create({
    professionalId: userId,
    slug: await generateUniqueSlug(input.title),
    createdViaAi: planCode === 'FREE' ? createdViaAi : false,
    ...buildFields(input),
  });

  if (planCode === 'FREE') {
    const countAfter = await Activity.countDocuments({ professionalId: userId });
    const remaining = Math.max(0, 2 - countAfter);
    if (createdViaAi) {
      const aiCountAfter = await Activity.countDocuments({ professionalId: userId, createdViaAi: true });
      const aiRemaining = Math.max(0, 2 - aiCountAfter);
      return success(
        res,
        {
          activity: toPublicActivity(activity),
          freeActivityLimit: { used: countAfter, max: 2, remaining },
          freeAiLimit: { used: aiCountAfter, max: 2, remaining: aiRemaining },
          warning: aiRemaining === 1 ? "Il ne vous reste plus qu'1 activité gratuite avec l'IA." : undefined,
        },
        201,
      );
    }
    return success(
      res,
      {
        activity: toPublicActivity(activity),
        freeActivityLimit: { used: countAfter, max: 2, remaining },
        warning: remaining === 1 ? "Il ne vous reste plus qu'1 activité gratuite." : undefined,
      },
      201,
    );
  }

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
