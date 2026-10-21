import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import type { FilterQuery } from 'mongoose';
import { AppError } from '../../middlewares/errorHandler.js';
import { Activity, toPublicActivity, type ActivityDocument, type ActivityStatus } from '../../models/Activity.js';
import { Category } from '../../models/Category.js';
import { Payment, type PaymentDocument } from '../../models/Payment.js';
import { Plan, toPublicPlan } from '../../models/Plan.js';
import { Review, toPublicReview, type ReviewDocument, type ReviewStatus } from '../../models/Review.js';
import { Solicitation } from '../../models/Solicitation.js';
import { toPublicUser, User } from '../../models/User.js';
import { paginated, success } from '../../utils/ApiResponse.js';
import { logger } from '../../utils/logger.js';
import type {
  AdminActivitiesInput,
  AdminPaymentsHealthInput,
  AdminPaymentsInput,
  AdminReviewsInput,
  CreateUserInput,
  SetActivityStatusInput,
  SetReviewStatusInput,
  SuspendUserInput,
  UpdatePlanInput,
  UpdateUserInput,
} from './validator.js';

export async function listUsers(_req: Request, res: Response) {
  const users = await User.find()
    .sort({ createdAt: -1 })
    .limit(200)
    .select('firstName lastName email phone role isVerified suspendedAt suspendedReason createdAt updatedAt');

  return success(res, { users: users.map((u) => toPublicUser(u)) });
}

export async function createUser(req: Request, res: Response) {
  const input = req.validBody as CreateUserInput;

  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw new AppError('Un compte existe déjà avec cette adresse email', 409);
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    ...(input.phone ? { phone: input.phone } : {}),
    passwordHash,
    role: input.role,
    // Un compte créé par un admin est actif immédiatement.
    isVerified: true,
    refreshTokens: [],
  });

  return success(res, { user: toPublicUser(user) }, 201);
}

export async function updateUser(req: Request, res: Response) {
  const { id } = req.validParams as { id: string };
  const input = req.validBody as UpdateUserInput;

  const user = await User.findById(id);
  if (!user) {
    throw new AppError('Compte introuvable', 404);
  }

  if (input.role !== undefined && input.role !== user.role) {
    if (req.user?.id === id) {
      throw new AppError('Vous ne pouvez pas modifier votre propre rôle', 422);
    }
    if (user.role === 'ADMIN') {
      const others = await User.countDocuments({ role: 'ADMIN', _id: { $ne: user._id } });
      if (others === 0) {
        throw new AppError('Impossible : c’est le dernier compte administrateur', 409);
      }
    }
    user.role = input.role;
  }

  if (input.firstName !== undefined) user.firstName = input.firstName;
  if (input.lastName !== undefined) user.lastName = input.lastName;
  if (input.phone !== undefined) {
    user.phone = input.phone || undefined;
  }
  if (input.isVerified !== undefined) user.isVerified = input.isVerified;

  await user.save();

  return success(res, { user: toPublicUser(user) });
}

export async function deleteUser(req: Request, res: Response) {
  const { id } = req.validParams as { id: string };

  const user = await User.findById(id);
  if (!user) {
    throw new AppError('Compte introuvable', 404);
  }

  if (req.user?.id === id) {
    throw new AppError('Vous ne pouvez pas supprimer votre propre compte ici (Paramètres → Supprimer mon compte)', 422);
  }

  if (user.role === 'ADMIN') {
    const others = await User.countDocuments({ role: 'ADMIN', _id: { $ne: user._id } });
    if (others === 0) {
      throw new AppError('Impossible : c’est le dernier compte administrateur', 409);
    }
  }

  const userId = user._id;
  await Promise.all([
    Activity.deleteMany({ professionalId: userId }),
    Solicitation.deleteMany({ $or: [{ fromId: userId }, { toId: userId }] }),
  ]);
  await user.deleteOne();

  logger.info(`Compte supprimé par un admin : ${user.email} (${userId.toString()})`);

  return success(res, { message: 'Compte supprimé' });
}

export async function suspendUser(req: Request, res: Response) {
  const { id } = req.validParams as { id: string };
  const input = req.validBody as SuspendUserInput;

  const user = await User.findById(id);
  if (!user) {
    throw new AppError('Compte introuvable', 404);
  }

  if (req.user?.id === id) {
    throw new AppError('Vous ne pouvez pas suspendre votre propre compte', 422);
  }

  if (input.suspended && user.role === 'ADMIN') {
    const others = await User.countDocuments({ role: 'ADMIN', _id: { $ne: user._id } });
    if (others === 0) {
      throw new AppError('Impossible : c’est le dernier compte administrateur', 409);
    }
  }

  if (input.suspended) {
    user.suspendedAt = new Date();
    user.suspendedReason = input.reason;
    user.refreshTokens = [];
  } else {
    user.suspendedAt = undefined;
    user.suspendedReason = undefined;
  }
  await user.save();

  logger.info(
    `${input.suspended ? 'Compte suspendu' : 'Compte réactivé'} par un admin : ${user.email} ` +
      `(${user._id.toString()})${input.reason ? ` — motif : ${input.reason}` : ''}`,
  );

  return success(res, { user: toPublicUser(user) });
}

export async function listAdminActivities(req: Request, res: Response) {
  const p = req.validQuery as AdminActivitiesInput;

  const filter: FilterQuery<ActivityDocument> = {};
  if (p.status) filter.status = p.status;
  if (p.professionalId) filter.professionalId = p.professionalId;
  if (p.q) {
    const rx = new RegExp(p.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: rx }, { description: rx }, { category: rx }, { slug: rx }];
  }

  const skip = (p.page - 1) * p.limit;
  const [activities, total] = await Promise.all([
    Activity.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(p.limit)
      .populate('professionalId', 'firstName lastName email'),
    Activity.countDocuments(filter),
  ]);

  const items = activities.map((a) => {
    const pub = toPublicActivity(a);
    const pro = a.professionalId as unknown as { _id: unknown; firstName: string; lastName: string; email?: string };
    return {
      ...pub,
      professional: {
        id: String(pro._id),
        firstName: pro.firstName,
        lastName: pro.lastName,
        ...(pro.email ? { email: pro.email } : {}),
      },
    };
  });

  return success(res, {
    activities: items,
    total,
    page: p.page,
    pages: Math.max(1, Math.ceil(total / p.limit)),
  });
}

export async function setActivityStatus(req: Request, res: Response) {
  const { id } = req.validParams as { id: string };
  const input = req.validBody as SetActivityStatusInput;

  const activity = await Activity.findById(id);
  if (!activity) {
    throw new AppError('Activité introuvable', 404);
  }

  if (activity.status === input.status) {
    throw new AppError('Cette activité a déjà ce statut', 409);
  }

  activity.status = input.status as ActivityStatus;
  if (req.user?.id) {
    activity.moderatedBy = req.user.id as unknown as ActivityDocument['moderatedBy'];
  }
  activity.moderatedAt = new Date();
  activity.moderationReason = input.status === 'APPROVED' ? undefined : input.reason;
  await activity.save();

  const label: Record<string, string> = { APPROVED: 'validée', REJECTED: 'refusée', SUSPENDED: 'suspendue' };
  logger.info(
    `Activité ${label[input.status]} par un admin : ${activity.title} (${id})` +
      `${input.reason ? ` — motif : ${input.reason}` : ''}`,
  );

  return success(res, { activity: toPublicActivity(activity) });
}

export async function adminStats(_req: Request, res: Response) {
  const [
    totalUsers,
    customers,
    professionals,
    admins,
    suspendedUsers,
    totalActivities,
    approvedActivities,
    pendingActivities,
    rejectedActivities,
    suspendedActivities,
    totalCategories,
    activeCategories,
    totalSolicitations,
    pendingSolicitations,
    acceptedSolicitations,
    declinedSolicitations,
    totalReviews,
    pendingReviews,
    approvedReviews,
    rejectedReviews,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'CUSTOMER' }),
    User.countDocuments({ role: 'PROFESSIONAL' }),
    User.countDocuments({ role: 'ADMIN' }),
    User.countDocuments({ suspendedAt: { $exists: true, $ne: null } }),
    Activity.countDocuments(),
    Activity.countDocuments({ status: 'APPROVED' }),
    Activity.countDocuments({ status: 'PENDING' }),
    Activity.countDocuments({ status: 'REJECTED' }),
    Activity.countDocuments({ status: 'SUSPENDED' }),
    Category.countDocuments(),
    Category.countDocuments({ active: true }),
    Solicitation.countDocuments(),
    Solicitation.countDocuments({ status: 'PENDING' }),
    Solicitation.countDocuments({ status: 'ACCEPTED' }),
    Solicitation.countDocuments({ status: 'DECLINED' }),
    Review.countDocuments(),
    Review.countDocuments({ status: 'PENDING' }),
    Review.countDocuments({ status: 'APPROVED' }),
    Review.countDocuments({ status: 'REJECTED' }),
  ]);

  return success(res, {
    stats: {
      users: { total: totalUsers, customers, professionals, admins, suspended: suspendedUsers },
      activities: {
        total: totalActivities,
        approved: approvedActivities,
        pending: pendingActivities,
        rejected: rejectedActivities,
        suspended: suspendedActivities,
      },
      categories: { total: totalCategories, active: activeCategories },
      solicitations: {
        total: totalSolicitations,
        pending: pendingSolicitations,
        accepted: acceptedSolicitations,
        declined: declinedSolicitations,
      },
      reviews: {
        total: totalReviews,
        pending: pendingReviews,
        approved: approvedReviews,
        rejected: rejectedReviews,
      },
    },
  });
}

/** Liste paginée des avis (Sprint 11) — reviewer + activité renseignés. */
export async function listAdminReviews(req: Request, res: Response) {
  const p = req.validQuery as AdminReviewsInput;

  const filter: FilterQuery<ReviewDocument> = {};
  if (p.status) filter.status = p.status;
  if (p.activityId) filter.activityId = p.activityId;
  if (p.q) {
    const rx = new RegExp(p.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ comment: rx }];
  }

  const skip = (p.page - 1) * p.limit;
  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(p.limit)
      .populate('reviewerId', 'firstName lastName email')
      .populate('activityId', 'title slug'),
    Review.countDocuments(filter),
  ]);

  const items = reviews.map((r) => {
    const reviewer = r.reviewerId as unknown as {
      _id: unknown;
      firstName: string;
      lastName: string;
      email?: string;
    };
    const act = r.activityId as unknown as { _id: unknown; title?: string; slug?: string } | null;
    return {
      id: String(r._id),
      rating: r.rating,
      comment: r.comment,
      status: r.status,
      ...(r.moderationReason ? { moderationReason: r.moderationReason } : {}),
      createdAt: r.createdAt,
      reviewer: {
        id: String(reviewer._id),
        firstName: reviewer.firstName,
        lastName: reviewer.lastName,
        ...(reviewer.email ? { email: reviewer.email } : {}),
      },
      ...(act?.title ? { activity: { id: String(act._id), title: act.title, ...(act.slug ? { slug: act.slug } : {}) } } : {}),
    };
  });

  return success(res, {
    reviews: items,
    total,
    page: p.page,
    pages: Math.max(1, Math.ceil(total / p.limit)),
  });
}

/** Modération d'un avis (Sprint 11) — même garde-fous que les activités. */
export async function setReviewStatus(req: Request, res: Response) {
  const { id } = req.validParams as { id: string };
  const input = req.validBody as SetReviewStatusInput;

  const review = await Review.findById(id).populate('activityId', 'title');
  if (!review) {
    throw new AppError('Avis introuvable', 404);
  }

  if (review.status === input.status) {
    throw new AppError('Cet avis a déjà ce statut', 409);
  }

  review.status = input.status as ReviewStatus;
  if (req.user?.id) {
    review.moderatedBy = req.user.id as unknown as ReviewDocument['moderatedBy'];
  }
  review.moderatedAt = new Date();
  review.moderationReason = input.status === 'APPROVED' ? undefined : input.reason;
  await review.save();

  const act = review.activityId as unknown as { title?: string } | null;
  const label: Record<string, string> = { APPROVED: 'approuvé', REJECTED: 'rejeté' };
  logger.info(
    `Avis ${label[input.status]} par un admin : ${act?.title ?? id} (${id})` +
      `${input.reason ? ` — motif : ${input.reason}` : ''}`,
  );

  return success(res, { review: toPublicReview(review, { withStatus: true }) });
}

/** Catalogue complet des plans (y compris inactifs) pour l'admin. */
export async function listAdminPlans(_req: Request, res: Response) {
  const plans = await Plan.find().sort({ order: 1 });
  return success(res, {
    plans: plans.map((plan) => ({
      ...toPublicPlan(plan),
      isActive: plan.isActive,
      createdAt: plan.createdAt,
    })),
  });
}

/** Modification d'un plan — prix/durée modifiables en base, jamais codés en dur côté client. */
export async function updatePlan(req: Request, res: Response) {
  const { id } = req.validParams as { id: string };
  const input = req.validBody as UpdatePlanInput;

  const plan = await Plan.findById(id);
  if (!plan) {
    throw new AppError('Plan introuvable', 404);
  }

  const changes: string[] = [];
  if (input.name !== undefined && input.name !== plan.name) {
    changes.push(`nom ${plan.name} → ${input.name}`);
    plan.name = input.name;
  }
  if (input.price !== undefined && input.price !== plan.price) {
    changes.push(`prix ${plan.price} → ${input.price} FCFA`);
    plan.price = input.price;
  }
  if (input.durationDays !== undefined && input.durationDays !== plan.durationDays) {
    changes.push(`durée ${plan.durationDays} → ${input.durationDays} j`);
    plan.durationDays = input.durationDays;
  }
  if (input.features !== undefined) {
    changes.push(`features (${input.features.length})`);
    plan.features = input.features;
  }
  if (input.highlight !== undefined && input.highlight !== plan.highlight) {
    changes.push(`mise en avant ${input.highlight}`);
    plan.highlight = input.highlight;
  }
  if (input.order !== undefined && input.order !== plan.order) {
    changes.push(`ordre ${plan.order} → ${input.order}`);
    plan.order = input.order;
  }
  if (input.isActive !== undefined && input.isActive !== plan.isActive) {
    changes.push(input.isActive ? 'reactivé' : 'désactivé');
    plan.isActive = input.isActive;
  }

  if (changes.length === 0) {
    throw new AppError('Aucune modification', 409);
  }

  await plan.save();
  logger.info(`Plan ${plan.code} modifiAc par un admin : ${changes.join(', ')}`);

  return success(res, { plan: { ...toPublicPlan(plan), isActive: plan.isActive } });
}

/* ------------------------------------------------------------------------- *
 * Paiements — diagnostic SebPay
 * ------------------------------------------------------------------------- */

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Extrait le motif d'erreur renvoyé par SebPay dans le corps brut stocké :
 * { code: 'PAYMENT_DECLINED', reference: 'ERR-XXXX', transaction_id: '261…' }.
 */
function parseProviderError(raw?: string): { code?: string; reference?: string; message?: string } | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as {
      message?: string;
      errors?: { code?: string; reference?: string; transaction_id?: string };
    };
    const errors = parsed.errors ?? {};
    const out: { code?: string; reference?: string; message?: string } = {};
    if (errors.code) out.code = errors.code;
    if (errors.reference) out.reference = errors.reference;
    if (parsed.message) out.message = parsed.message;
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    const ref = raw.match(/"reference"\s*:\s*"(ERR-[A-Z0-9]+)"/i)?.[1];
    return ref ? { reference: ref } : undefined;
  }
}

/** Vue admin d'un paiement :/providerRef sert à rapprocher avec le support SebPay. */
function toAdminPayment(payment: {
  _id: unknown;
  userId: unknown;
  planId: unknown;
  amount: number;
  currency: string;
  provider: string;
  providerRef?: string;
  network?: string;
  phoneNumber?: string;
  status: string;
  failureReason?: string;
  providerRaw?: string;
  paidAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  const user = payment.userId as { email?: string; firstName?: string; lastName?: string } | undefined;
  const plan = payment.planId as { code?: string; name?: string; price?: number } | undefined;
  return {
    id: String(payment._id),
    user: user ? { email: user.email, firstName: user.firstName, lastName: user.lastName } : undefined,
    plan: plan ? { code: plan.code, name: plan.name, price: plan.price } : undefined,
    amount: payment.amount,
    currency: payment.currency,
    provider: payment.provider,
    status: payment.status,
    network: payment.network,
    phoneNumber: payment.phoneNumber,
    providerRef: payment.providerRef,
    providerError: parseProviderError(payment.providerRaw),
    failureReason: payment.failureReason,
    providerRaw: payment.providerRaw ? payment.providerRaw.slice(0, 600) : undefined,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

/**
 * Historique des paiements (admin) : filtres opérateur / statut / numéro / période.
 * Expose les références SebPay (transaction_id + ERR-…) pour le support.
 */
export async function listAdminPayments(req: Request, res: Response) {
  const q = req.validQuery as AdminPaymentsInput;

  const filter: FilterQuery<PaymentDocument> = {};
  if (q.status) filter.status = q.status;
  if (q.network) filter.network = q.network;
  if (q.phone) filter.phoneNumber = new RegExp(escapeRegExp(q.phone), 'i');
  if (q.userId) filter.userId = q.userId;
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = q.from;
    if (q.to) filter.createdAt.$lte = q.to;
  }

  const page = q.page ?? 1;
  const limit = q.limit ?? 50;

  const [items, total] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'firstName lastName email')
      .populate('planId', 'code name price'),
    Payment.countDocuments(filter),
  ]);

  return paginated(res, { payments: items.map((p) => toAdminPayment(p as never)) }, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}

/**
 * Santé des opérateurs sur une fenêtre glissante.
 * Signature d'un blocage côté opérateur : refus instantané (durée moyenne < 10 s)
 * et taux de succès nul sur l'ensemble de la fenêtre.
 */
export async function adminPaymentsHealth(req: Request, res: Response) {
  const { hours } = req.validQuery as AdminPaymentsHealthInput;
  const since = new Date(Date.now() - hours * 3600 * 1000);

  const rows = await Payment.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $ifNull: ['$network', 'inconnu'] },
        attempts: { $sum: 1 },
        approved: { $sum: { $cond: [{ $eq: ['$status', 'SUCCESSFUL'] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } },
        expired: { $sum: { $cond: [{ $eq: ['$status', 'EXPIRED'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
        avgDurationSec: { $avg: { $divide: [{ $subtract: ['$updatedAt', '$createdAt'] }, 1000] } },
        minDurationSec: { $min: { $divide: [{ $subtract: ['$updatedAt', '$createdAt'] }, 1000] } },
        maxDurationSec: { $max: { $divide: [{ $subtract: ['$updatedAt', '$createdAt'] }, 1000] } },
      },
    },
    { $sort: { attempts: -1 } },
  ]);

  const operators = rows.map((row) => {
    const approved = row.approved as number;
    const attempts = row.attempts as number;
    return {
      operator: row._id as string,
      attempts,
      approved,
      rejected: row.rejected as number,
      expired: row.expired as number,
      pending: row.pending as number,
      successRate: attempts > 0 ? Math.round((approved / attempts) * 100) : 0,
      avgDurationSec: Math.round(row.avgDurationSec as number),
      minDurationSec: Math.round(row.minDurationSec as number),
      maxDurationSec: Math.round(row.maxDurationSec as number),
      /** Refus instantané et répété => l'opérateur refuse au niveau du compte marchand. */
      verdict:
        approved === 0 && (row.rejected as number) > 0
          ? 'aucune collecte approuvée sur la fenêtre'
          : attempts > 0 && approved / attempts < 0.2
            ? 'taux de succès très faible'
            : 'normal',
    };
  });

  const recentFailures = await Payment.find({ status: 'FAILED', createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('userId', 'firstName lastName email')
    .populate('planId', 'code name price');

  const lastSuccess = await Payment.find({ status: 'SUCCESSFUL' })
    .sort({ paidAt: -1 })
    .limit(1)
    .populate('userId', 'firstName lastName email');

  return success(res, {
    windowHours: hours,
    since,
    operators,
    recentFailures: recentFailures.map((p) => toAdminPayment(p as never)),
    lastSuccess: lastSuccess[0] ? toAdminPayment(lastSuccess[0] as never) : null,
  });
}
