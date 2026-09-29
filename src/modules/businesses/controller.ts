import type { Request, Response } from 'express';
import type { FilterQuery, PipelineStage } from 'mongoose';
import { AppError } from '../../middlewares/errorHandler.js';
import { Activity, toPublicActivity, type ActivityDocument } from '../../models/Activity.js';
import { User } from '../../models/User.js';
import { success } from '../../utils/ApiResponse.js';
import type { BusinessSearchInput, BusinessSlugParam } from './validator.js';

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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Recherche géolocalisée (Sprint 5) : $geoNear trié par distance si coords, sinon récent. */
export async function searchBusinesses(req: Request, res: Response) {
  const p = req.validQuery as BusinessSearchInput;

  const filter: FilterQuery<ActivityDocument> = {};
  if (p.q) {
    const rx = new RegExp(escapeRegex(p.q), 'i');
    filter.$or = [{ title: rx }, { description: rx }, { category: rx }];
  }
  if (p.category) {
    filter.category = { $regex: `^${escapeRegex(p.category)}$`, $options: 'i' };
  }
  if (p.city) {
    filter['address.city'] = { $regex: escapeRegex(p.city), $options: 'i' };
  }

  const hasGeo = typeof p.latitude === 'number' && typeof p.longitude === 'number';
  const pipeline: PipelineStage[] = [];

  if (hasGeo) {
    pipeline.push({
      $geoNear: {
        near: { type: 'Point', coordinates: [p.longitude as number, p.latitude as number] },
        distanceField: 'distance',
        maxDistance: p.radius ?? 20000,
        spherical: true,
        query: filter,
      },
    });
  } else {
    pipeline.push({ $match: filter });
    pipeline.push({ $sort: { createdAt: -1 } });
  }
  pipeline.push({ $limit: p.limit });

  const rows = (await Activity.aggregate(pipeline)) as Array<
    ActivityDocument & { _id: unknown; distance?: number }
  >;
  const items = rows.map((row) => ({
    ...toPublicActivity(row),
    ...(typeof row.distance === 'number' ? { distance: Math.round(row.distance) } : {}),
  }));

  return success(res, { items, count: items.length, geo: hasGeo });
}
