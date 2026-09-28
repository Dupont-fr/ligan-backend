import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { AppError } from '../../middlewares/errorHandler.js';
import { toPublicUser, User } from '../../models/User.js';
import { success } from '../../utils/ApiResponse.js';
import type { CreateUserInput } from './validator.js';

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
