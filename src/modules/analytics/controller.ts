import type { Request, Response } from 'express';
import { AppError } from '../../middlewares/errorHandler.js';
import { Activity } from '../../models/Activity.js';
import { BusinessEvent, BUSINESS_EVENT_TYPES, type BusinessEventType } from '../../models/BusinessEvent.js';
import { User } from '../../models/User.js';
import { success } from '../../utils/ApiResponse.js';
import type { StatsQueryInput, TrackEventInput } from './validator.js';

/** Enregistre une interaction visiteur sur une activité validée (Sprint 10). */
export async function trackEvent(req: Request, res: Response) {
  const input = req.validBody as TrackEventInput;

  const activity = await Activity.findById(input.activityId).select('_id status');
  if (!activity || activity.status !== 'APPROVED') {
    throw new AppError('Activité introuvable', 404);
  }

  await BusinessEvent.create({
    activityId: input.activityId,
    type: input.type,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });

  return success(res, { tracked: true }, 201);
}

type Counts = Record<BusinessEventType, number>;

function emptyCounts(): Counts {
  return { PROFILE_VIEW: 0, PHONE_CLICK: 0, WHATSAPP_CLICK: 0, DIRECTION_CLICK: 0 };
}

const sum = (c: Counts) => BUSINESS_EVENT_TYPES.reduce((acc, t) => acc + c[t], 0);

function sinceFor(period: StatsQueryInput['period']): Date {
  if (period === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return new Date(Date.now() - (period === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000);
}

async function countsByActivity(match: Record<string, unknown>): Promise<Map<string, Counts>> {
  const rows = (await BusinessEvent.aggregate([
    { $match: match },
    { $group: { _id: { activityId: '$activityId', type: '$type' }, n: { $sum: 1 } } },
  ])) as Array<{ _id: { activityId: unknown; type: BusinessEventType }; n: number }>;

  const perActivity = new Map<string, Counts>();
  for (const row of rows) {
    if (!(row._id.type in emptyCounts())) continue;
    const key = String(row._id.activityId);
    const counts = perActivity.get(key) ?? emptyCounts();
    counts[row._id.type] += row.n;
    perActivity.set(key, counts);
  }
  return perActivity;
}

/** Statistiques du professionnel connecté : globales + par activité. */
export async function myStats(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentification requise', 401);
  }
  const { period } = req.validQuery as StatsQueryInput;
  const since = sinceFor(period);

  const activities = await Activity.find({ professionalId: userId })
    .select('title status slug')
    .sort({ createdAt: -1 })
    .lean();
  const ids = activities.map((a) => a._id);

  const totals = emptyCounts();
  const perActivity = new Map<string, Counts>();
  if (ids.length > 0) {
    const match = { activityId: { $in: ids }, createdAt: { $gte: since } };
    const found = await countsByActivity(match);
    for (const [key, counts] of found) {
      perActivity.set(key, counts);
      for (const type of BUSINESS_EVENT_TYPES) totals[type] += counts[type];
    }
  }

  return success(res, {
    period,
    since,
    totals,
    total: sum(totals),
    byActivity: activities.map((a) => {
      const counts = perActivity.get(String(a._id)) ?? emptyCounts();
      return { id: String(a._id), title: a.title, status: a.status, counts, total: sum(counts) };
    }),
  });
}

/** Vue plateforme (ADMIN) : totaux globaux + top activités avec propriétaire. */
export async function platformOverview(req: Request, res: Response) {
  const { period } = req.validQuery as StatsQueryInput;
  const since = sinceFor(period);

  // Totaux globaux (inclut les events dont l'activité aurait été supprimée)
  const totals = emptyCounts();
  const totalRows = (await BusinessEvent.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: '$type', n: { $sum: 1 } } },
  ])) as Array<{ _id: BusinessEventType; n: number }>;
  for (const row of totalRows) {
    if (row._id in totals) totals[row._id] += row.n;
  }

  const perActivity = await countsByActivity({ createdAt: { $gte: since } });

  const activities = await Activity.find({ _id: { $in: [...perActivity.keys()] } })
    .select('title status slug professionalId')
    .lean();
  const pros = await User.find({ _id: { $in: activities.map((a) => a.professionalId) } })
    .select('firstName lastName')
    .lean();
  const proMap = new Map(pros.map((p) => [String(p._id), p]));

  const byActivity = activities
    .map((a) => {
      const counts = perActivity.get(String(a._id)) ?? emptyCounts();
      const pro = proMap.get(String(a.professionalId));
      return {
        id: String(a._id),
        title: a.title,
        status: a.status,
        professional: pro ? { firstName: pro.firstName, lastName: pro.lastName } : null,
        counts,
        total: sum(counts),
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);

  return success(res, {
    period,
    since,
    totals,
    total: sum(totals),
    byActivity,
  });
}
