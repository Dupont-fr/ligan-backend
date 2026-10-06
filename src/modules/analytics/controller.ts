import type { Request, Response } from 'express';
import { AppError } from '../../middlewares/errorHandler.js';
import { Activity } from '../../models/Activity.js';
import { BusinessEvent, BUSINESS_EVENT_TYPES, type BusinessEventType } from '../../models/BusinessEvent.js';
import { Payment } from '../../models/Payment.js';
import { Plan } from '../../models/Plan.js';
import { Solicitation } from '../../models/Solicitation.js';
import { Subscription } from '../../models/Subscription.js';
import { User } from '../../models/User.js';
import { success } from '../../utils/ApiResponse.js';
import type { HistoryQueryInput, StatsQueryInput, TrackEventInput } from './validator.js';

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

/** Une entrée des courbes d'évolution (cumul jusqu'à la fin du bucket). */
interface HistoryPoint {
  date: string;
  users: number;
  activities: number;
  activeSubs: number;
  solicitations: number;
  revenue: number;
}

/**
 * Évolution dans le temps (graphiques admin) : totaux cumulés par jour
 * (30/90 jours) ou par mois (12 mois) — utilisateurs, activités créées,
 * abonnements payants actifs à l'instant t, sollicitations et revenus
 * encaissés (paiements SUCCESSFUL).
 */
export async function platformHistory(req: Request, res: Response) {
  const { range } = req.validQuery as HistoryQueryInput;
  const DAY_MS = 86_400_000;
  const monthly = range === '12mo';
  const days = range === '30d' ? 30 : range === '90d' ? 90 : 365;
  const now = Date.now();

  // Plancher à minuit UTC (ou au 1er du mois) : buckets réguliers, clés ISO.
  const from = new Date(now - days * DAY_MS);
  from.setUTCHours(0, 0, 0, 0);
  if (monthly) from.setUTCDate(1);

  const buckets: Array<{ key: string; end: number }> = [];
  for (const cursor = new Date(from); cursor.getTime() <= now; ) {
    const end = new Date(cursor);
    if (monthly) end.setUTCMonth(end.getUTCMonth() + 1);
    else end.setUTCDate(end.getUTCDate() + 1);
    buckets.push({
      key: monthly ? cursor.toISOString().slice(0, 7) : cursor.toISOString().slice(0, 10),
      end: Math.min(end.getTime(), now + 1),
    });
    if (monthly) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Les plans gratuits (price = 0) n'entrent pas dans « abonnements actifs ».
  const paidPlans = await Plan.find({ price: { $gt: 0 } }).select('_id').lean();

  const [userRows, activityRows, solicitRows, paymentRows, subRows] = await Promise.all([
    User.find({}).select('createdAt').lean(),
    Activity.find({}).select('createdAt').lean(),
    Solicitation.find({}).select('createdAt').lean(),
    Payment.find({ status: 'SUCCESSFUL' }).select('amount paidAt createdAt').lean(),
    Subscription.find({ planId: { $in: paidPlans.map((p) => p._id) } })
      .select('startDate endDate')
      .lean(),
  ]);

  const userTimes = userRows.map((d) => d.createdAt.getTime());
  const activityTimes = activityRows.map((d) => d.createdAt.getTime());
  const solicitTimes = solicitRows.map((d) => d.createdAt.getTime());
  const paymentTimes = paymentRows.map((p) => ({
    t: (p.paidAt ?? p.createdAt).getTime(),
    amount: p.amount ?? 0,
  }));
  const subs = subRows.map((s) => ({
    start: s.startDate.getTime(),
    end: s.endDate ? s.endDate.getTime() : null,
  }));

  const points: HistoryPoint[] = buckets.map((b) => ({
    date: b.key,
    users: userTimes.filter((t) => t < b.end).length,
    activities: activityTimes.filter((t) => t < b.end).length,
    activeSubs: subs.filter((s) => s.start < b.end && (s.end === null || s.end > b.end)).length,
    solicitations: solicitTimes.filter((t) => t < b.end).length,
    revenue: paymentTimes.filter((p) => p.t < b.end).reduce((total, p) => total + p.amount, 0),
  }));

  return success(res, {
    range,
    granularity: monthly ? 'month' : 'day',
    from: from.toISOString(),
    points,
  });
}
