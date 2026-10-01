import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import type { FilterQuery } from 'mongoose';
import { AppError } from '../../middlewares/errorHandler.js';
import { Activity, toPublicActivity, type ActivityDocument, type ActivityStatus } from '../../models/Activity.js';
import { Category } from '../../models/Category.js';
import { Review, toPublicReview, type ReviewDocument, type ReviewStatus } from '../../models/Review.js';
import { Solicitation } from '../../models/Solicitation.js';
import { toPublicUser, User } from '../../models/User.js';
import { success } from '../../utils/ApiResponse.js';
import { logger } from '../../utils/logger.js';
import type {
  AdminActivitiesInput,
  AdminReviewsInput,
  CreateUserInput,
  SetActivityStatusInput,
  SetReviewStatusInput,
  SuspendUserInput,
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
