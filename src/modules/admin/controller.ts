import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { AppError } from '../../middlewares/errorHandler.js';
import { Activity } from '../../models/Activity.js';
import { Category } from '../../models/Category.js';
import { Solicitation } from '../../models/Solicitation.js';
import { toPublicUser, User } from '../../models/User.js';
import { success } from '../../utils/ApiResponse.js';
import { logger } from '../../utils/logger.js';
import type { CreateUserInput, UpdateUserInput } from './validator.js';

export async function listUsers(_req: Request, res: Response) {
  const users = await User.find()
    .sort({ createdAt: -1 })
    .limit(200)
    .select('firstName lastName email phone role isVerified createdAt updatedAt');

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

export async function adminStats(_req: Request, res: Response) {
  const [
    totalUsers,
    customers,
    professionals,
    admins,
    totalActivities,
    totalCategories,
    activeCategories,
    totalSolicitations,
    pendingSolicitations,
    acceptedSolicitations,
    declinedSolicitations,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'CUSTOMER' }),
    User.countDocuments({ role: 'PROFESSIONAL' }),
    User.countDocuments({ role: 'ADMIN' }),
    Activity.countDocuments(),
    Category.countDocuments(),
    Category.countDocuments({ active: true }),
    Solicitation.countDocuments(),
    Solicitation.countDocuments({ status: 'PENDING' }),
    Solicitation.countDocuments({ status: 'ACCEPTED' }),
    Solicitation.countDocuments({ status: 'DECLINED' }),
  ]);

  return success(res, {
    stats: {
      users: { total: totalUsers, customers, professionals, admins },
      activities: { total: totalActivities },
      categories: { total: totalCategories, active: activeCategories },
      solicitations: {
        total: totalSolicitations,
        pending: pendingSolicitations,
        accepted: acceptedSolicitations,
        declined: declinedSolicitations,
      },
    },
  });
}
