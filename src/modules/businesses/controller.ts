import type { Request, Response } from 'express';
import type { FilterQuery, PipelineStage } from 'mongoose';
import { AppError } from '../../middlewares/errorHandler.js';
import { Activity, toPublicActivity, type ActivityDocument } from '../../models/Activity.js';
import { Review, toPublicReview } from '../../models/Review.js';
import { User } from '../../models/User.js';
import { resolvePlan } from '../../services/payments/index.js';
import { success } from '../../utils/ApiResponse.js';
import type { BusinessSearchInput, BusinessSlugParam } from './validator.js';

/** Fiche publique d'une activité (Sprint 4) : activité + professionnel. */
export async function getBusiness(req: Request, res: Response) {
  const { slug } = req.validParams as BusinessSlugParam;

  const activity = await Activity.findOne({ slug });
  if (!activity) {
    throw new AppError('Fiche introuvable', 404);
  }

  // Hors statut validé : visible uniquement par son propriétaire et les admins
  // (le pro doit pouvoir prévisualiser son activité en attente de modération).
  if (activity.status !== 'APPROVED') {
    const isOwner = req.user?.id === String(activity.professionalId);
    const isAdmin = req.user?.role === 'ADMIN';
    if (!isOwner && !isAdmin) {
      throw new AppError('Fiche introuvable', 404);
    }
  }

  const pro = await User.findById(activity.professionalId).select('firstName lastName isVerified createdAt');
  if (!pro) {
    throw new AppError('Fiche introuvable', 404);
  }

  // Plan effectif du pro (Sprint 14) — pilote le badge Premium de la fiche.
  const { code: planCode } = await resolvePlan(String(pro._id));

  // Note moyenne + avis publics (Sprint 11) : seuls les avis APPROVED comptent.
  const [ratingRows, reviewDocs] = await Promise.all([
    Review.aggregate<{ _id: null; avg: number; n: number }>([
      { $match: { activityId: activity._id, status: 'APPROVED' } },
      { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
    ]),
    Review.find({ activityId: activity._id, status: 'APPROVED' })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('reviewerId', 'firstName lastName'),
  ]);

  return success(res, {
    activity: toPublicActivity(activity),
    professional: {
      id: String(pro._id),
      firstName: pro.firstName,
      lastName: pro.lastName,
      isVerified: Boolean(pro.isVerified),
      memberSince: pro.createdAt ?? null,
      planCode,
    },
    rating: {
      average: ratingRows.length > 0 ? Math.round(ratingRows[0].avg * 10) / 10 : 0,
      count: ratingRows.length > 0 ? ratingRows[0].n : 0,
    },
    reviews: reviewDocs.map((r) => toPublicReview(r)),
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type SearchRow = ActivityDocument & {
  _id: unknown;
  distance?: number;
  isVerified?: boolean;
  planCode?: string;
  rank?: number;
};

const DAY_BY_GETDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
/** Tri/match insensibles à la casse et aux accents. */
const COLLATION = { locale: 'fr', strength: 2 } as const;

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Ouvert à l'instant d'après les horaires du document (plage passant minuit gérée). */
function isOpenAt(row: ActivityDocument): boolean {
  const now = new Date();
  const day = DAY_BY_GETDAY[now.getDay()];
  const slot = (row.openingHours ?? []).find((h) => h.day === day);
  if (!slot || slot.closed) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const open = toMinutes(slot.open);
  const close = toMinutes(slot.close);
  if (close <= open) return minutes >= open || minutes < close;
  return minutes >= open && minutes < close;
}

/**
 * Enrichissement Sprint 14 « Premium et visibilité » : owner vérifié
 * (filtre `verified` optionnel) + plan effectif de l'abonnement
 * (FREE/PRO/PREMIUM) calculé à la volée + `rank` pour le boost.
 */
function enrichStages(now: Date, verified?: boolean): PipelineStage[] {
  return [
    { $lookup: { from: 'users', localField: 'professionalId', foreignField: '_id', as: 'proOwner' } },
    ...(verified !== undefined ? [{ $match: { 'proOwner.isVerified': verified } } as PipelineStage.Match] : []),
    {
      $lookup: {
        from: 'subscriptions',
        let: { proId: '$professionalId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$userId', '$$proId'] },
                  { $eq: ['$status', 'ACTIVE'] },
                  { $or: [{ $eq: ['$endDate', null] }, { $gt: ['$endDate', now] }] },
                ],
              },
            },
          },
          { $lookup: { from: 'plans', localField: 'planId', foreignField: '_id', as: 'planDoc' } },
          { $unwind: { path: '$planDoc', preserveNullAndEmptyArrays: true } },
          { $project: { _id: 0, code: '$planDoc.code' } },
        ],
        as: 'subPlan',
      },
    },
    {
      $addFields: {
        isVerified: { $arrayElemAt: ['$proOwner.isVerified', 0] },
        planCode: { $arrayElemAt: ['$subPlan.code', 0] },
      },
    },
    {
      $addFields: {
        // Position prioritaire : PREMIUM > PRO > FREE (triées ensuite sur `rank`).
        rank: {
          $switch: {
            branches: [
              { case: { $eq: ['$planCode', 'PREMIUM'] }, then: 2 },
              { case: { $eq: ['$planCode', 'PRO'] }, then: 1 },
            ],
            default: 0,
          },
        },
      },
    },
  ];
}

/**
 * Rangées « activités récentes » de la landing : les 2 catégories comptant
 * le plus d'activités approuvées, avec leurs 5 dernières activités chacune.
 */
export async function recentByCategory(_req: Request, res: Response) {
  const groups = await Activity.aggregate<{ _id: string; count: number }>(
    [
      { $match: { status: 'APPROVED' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 2 },
    ],
    { collation: COLLATION },
  );

  const now = new Date();
  const rows = await Promise.all(
    groups.map(async (g) => {
      const docs = (await Activity.aggregate(
        [
          { $match: { status: 'APPROVED', category: g._id } },
          ...enrichStages(now),
          { $sort: { createdAt: -1 } },
          { $limit: 5 },
          { $project: { proOwner: 0, subPlan: 0, rank: 0 } },
        ],
        { collation: COLLATION },
      )) as SearchRow[];

      return {
        category: String(g._id),
        count: g.count,
        items: docs.map((row) => ({
          ...toPublicActivity(row),
          isVerified: row.isVerified === true,
          planCode: row.planCode ?? 'FREE',
        })),
      };
    }),
  );

  return success(res, { rows });
}

/**
 * Recherche géolocalisée (Sprint 5) + filtres et tri (Sprint 6).
 * `openNow` est appliqué en mémoire après l'agrégation (volume MVP) — d'où
 * l'absence de `$limit` dans le pipeline dans ce cas.
 */
export async function searchBusinesses(req: Request, res: Response) {
  const p = req.validQuery as BusinessSearchInput;

  const filter: FilterQuery<ActivityDocument> = { status: 'APPROVED' };
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
  if (p.hasPhotos !== undefined) {
    filter.$expr = p.hasPhotos
      ? { $gt: [{ $size: { $ifNull: ['$photos', []] } }, 0] }
      : { $eq: [{ $size: { $ifNull: ['$photos', []] } }, 0] };
  }

  const hasGeo = typeof p.latitude === 'number' && typeof p.longitude === 'number';
  const sort = p.sort ?? (hasGeo ? 'distance' : 'recent');

  const base: PipelineStage[] = [];
  if (hasGeo) {
    base.push({
      $geoNear: {
        near: { type: 'Point', coordinates: [p.longitude as number, p.latitude as number] },
        distanceField: 'distance',
        maxDistance: p.radius ?? 20000,
        spherical: true,
        query: filter,
      },
    });
  } else {
    base.push({ $match: filter });
  }

  // Sprint 14 « Premium et visibilité » : enrichissement du pipeline —
  // vérification du propriétaire (badge + filtre `verified`) et plan effectif
  // de l'abonnement (FREE/PRO/PREMIUM) calculé à la volée pour le boost.
  const enrich = enrichStages(new Date(), p.verified);
  const strip: PipelineStage = { $project: { proOwner: 0, subPlan: 0, rank: 0 } };

  // Tri : la position prioritaire (rank) domine, puis le critère demandé —
  // sauf `name` (alphabétique attendu tel quel).
  const sortStages: PipelineStage.Sort[] =
    sort === 'name'
      ? [{ $sort: { title: 1 } }]
      : sort === 'recent'
        ? [{ $sort: { rank: -1, createdAt: -1 } }]
        : [{ $sort: { rank: -1, distance: 1 } }];

  const skip = (p.page - 1) * p.limit;
  let rows: SearchRow[];
  let total: number;

  if (p.openNow !== undefined) {
    const all = (await Activity.aggregate([...base, ...enrich, ...sortStages, strip], {
      collation: COLLATION,
    })) as SearchRow[];
    const filtered = all.filter((row) => isOpenAt(row) === p.openNow);
    total = filtered.length;
    rows = filtered.slice(skip, skip + p.limit);
  } else {
    const [items, counts] = await Promise.all([
      Activity.aggregate([...base, ...enrich, ...sortStages, strip, { $skip: skip }, { $limit: p.limit }], {
        collation: COLLATION,
      }),
      Activity.aggregate([...base, ...enrich, { $count: 'total' }], { collation: COLLATION }),
    ]);
    rows = items as SearchRow[];
    total = (counts[0]?.total as number | undefined) ?? 0;
  }

  const items = rows.map((row) => ({
    ...toPublicActivity(row),
    ...(typeof row.distance === 'number' ? { distance: Math.round(row.distance) } : {}),
    isVerified: row.isVerified === true,
    planCode: row.planCode ?? 'FREE',
  }));

  return success(res, {
    items,
    count: items.length,
    total,
    page: p.page,
    pages: Math.max(1, Math.ceil(total / p.limit)),
    geo: hasGeo,
    sort,
  });
}
