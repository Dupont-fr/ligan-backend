import type { Request, Response } from 'express';
import { AppError } from '../../middlewares/errorHandler.js';
import { Activity } from '../../models/Activity.js';
import { BusinessEvent, BUSINESS_EVENT_TYPES, type BusinessEventType } from '../../models/BusinessEvent.js';
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

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

type Counts = Record<BusinessEventType, number>;

function emptyCounts(): Counts {
  return { PROFILE_VIEW: 0, PHONE_CLICK: 0, WHATSAPP_CLICK: 0, DIRECTION_CLICK: 0 };
}

/** Statistiques du professionnel connecté : globales + par activité. */
export async function myStats(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentification requise', 401);
  }
  const { period } = req.validQuery as StatsQueryInput;

  const since =
    period === 'today'
      ? startOfToday()
      : new Date(Date.now() - (period === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000);

  const activities = await Activity.find({ professionalId: userId })
    .select('title status slug')
    .sort({ createdAt: -1 })
    .lean();
  const ids = activities.map((a) => a._id);

  const totals = emptyCounts();
  const perActivity = new Map<string, Counts>();

  if (ids.length > 0) {
    const rows = (await BusinessEvent.aggregate([
      { $match: { activityId: { $in: ids }, createdAt: { $gte: since } } },
      { $group: { _id: { activityId: '$activityId', type: '$type' }, n: { $sum: 1 } } },
    ])) as Array<{ _id: { activityId: unknown; type: BusinessEventType }; n: number }>;

    for (const row of rows) {
      if (!(row._id.type in totals)) continue;
      const key = String(row._id.activityId);
      totals[row._id.type] += row.n;
      const counts = perActivity.get(key) ?? emptyCounts();
      counts[row._id.type] += row.n;
      perActivity.set(key, counts);
    }
  }

  const sum = (c: Counts) => BUSINESS_EVENT_TYPES.reduce((acc, t) => acc + c[t], 0);

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
