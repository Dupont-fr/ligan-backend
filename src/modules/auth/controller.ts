import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { AppError } from '../../middlewares/errorHandler.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../middlewares/auth.js';
import { toPublicUser, User } from '../../models/User.js';
import { sendResetPasswordEmail, sendVerificationEmail } from '../../services/email.js';
import { success } from '../../utils/ApiResponse.js';
import {
  createAccessToken,
  generateRefreshToken,
  hashValue,
  randomToken,
} from '../../utils/tokens.js';
import env from '../../config/env.js';
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailQuery,
} from './validator.js';

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const MAX_REFRESH_TOKENS = 5;

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: (env.isProduction ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const accessMs = 15 * 60 * 1000;
  const refreshMs = env.refreshTokenDays * 24 * 60 * 60 * 1000;
  res.cookie(ACCESS_COOKIE, accessToken, cookieOptions(accessMs));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(refreshMs));
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...cookieOptions(0) });
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(0) });
}

async function addRefreshToken(userId: string, refreshToken: string) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('Utilisateur introuvable', 401);
  }
  const tokens = (user.refreshTokens ?? []).filter((t) => t !== refreshToken);
  tokens.push(hashValue(refreshToken));
  while (tokens.length > MAX_REFRESH_TOKENS) {
    tokens.shift();
  }
  user.refreshTokens = tokens;
  await user.save();
}

export async function register(req: Request, res: Response) {
  const { firstName, lastName, email, phone, password } = req.validBody as RegisterInput;

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError('Un compte existe déjà avec cette adresse email', 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const verificationToken = randomToken();

  const user = await User.create({
    firstName,
    lastName,
    email,
    ...(phone ? { phone } : {}),
    passwordHash,
    isVerified: false,
    verificationToken: hashValue(verificationToken),
    verificationTokenExpires: new Date(Date.now() + VERIFICATION_TTL_MS),
    refreshTokens: [],
  });

  const url = `${env.frontendUrl}/verify-email?token=${verificationToken}`;
  await sendVerificationEmail(email, url);

  return success(res, { user: toPublicUser(user) }, 201);
}

export async function verifyEmail(req: Request, res: Response) {
  const { token } = req.validQuery as VerifyEmailQuery;
  const hashed = hashValue(token);

  const user = await User.findOne({
    verificationToken: hashed,
    verificationTokenExpires: { $gt: new Date() },
  });
  if (!user) {
    throw new AppError('Lien de vérification invalide ou expiré', 400);
  }

  user.isVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpires = undefined;
  await user.save();

  return success(res, { user: toPublicUser(user), message: 'Compte vérifié, connecte-toi maintenant' });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.validBody as LoginInput;

  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError('Email ou mot de passe incorrect', 401);
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    throw new AppError('Email ou mot de passe incorrect', 401);
  }

  if (!user.isVerified) {
    throw new AppError('Vérifie ton adresse email avant de te connecter', 403);
  }

  const accessToken = createAccessToken({ id: user._id.toString(), role: user.role });
  const refreshToken = generateRefreshToken();
  await addRefreshToken(user._id.toString(), refreshToken);
  setAuthCookies(res, accessToken, refreshToken);

  return success(res, { user: toPublicUser(user) });
}

export async function refresh(req: Request, res: Response) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (!refreshToken) {
    throw new AppError('Session expirée', 401);
  }

  const hashed = hashValue(refreshToken);
  const user = await User.findOne({ refreshTokens: hashed });
  if (!user) {
    throw new AppError('Session invalide, reconnecte-toi', 401);
  }

  const tokens = (user.refreshTokens ?? []).filter((t) => t !== hashed);

  const accessToken = createAccessToken({ id: user._id.toString(), role: user.role });
  const newRefreshToken = generateRefreshToken();
  tokens.push(hashValue(newRefreshToken));
  while (tokens.length > MAX_REFRESH_TOKENS) {
    tokens.shift();
  }

  user.refreshTokens = tokens;
  await user.save();

  setAuthCookies(res, accessToken, newRefreshToken);

  return success(res, { user: toPublicUser(user) });
}

export async function logout(req: Request, res: Response) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (refreshToken) {
    await User.updateOne(
      { refreshTokens: hashValue(refreshToken) },
      { $pull: { refreshTokens: hashValue(refreshToken) } },
    );
  }
  clearAuthCookies(res);
  return success(res, { message: 'Déconnecté' });
}

export async function me(req: Request, res: Response) {
  if (!req.user) {
    throw new AppError('Authentification requise', 401);
  }
  const user = await User.findById(req.user.id);
  if (!user) {
    throw new AppError('Utilisateur introuvable', 404);
  }
  return success(res, { user: toPublicUser(user) });
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.validBody as ForgotPasswordInput;
  const message =
    'Si un compte existe avec cette adresse email, un lien de réinitialisation a été envoyé.';

  const user = await User.findOne({ email });
  if (user) {
    const token = randomToken();
    user.resetPasswordToken = hashValue(token);
    user.resetPasswordExpires = new Date(Date.now() + RESET_TTL_MS);
    await user.save();
    await sendResetPasswordEmail(email, `${env.frontendUrl}/reset-password?token=${token}`);
  }

  return success(res, { message });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.validBody as ResetPasswordInput;
  const hashed = hashValue(token);

  const user = await User.findOne({
    resetPasswordToken: hashed,
    resetPasswordExpires: { $gt: new Date() },
  });
  if (!user) {
    throw new AppError('Lien de réinitialisation invalide ou expiré', 400);
  }

  user.passwordHash = await bcrypt.hash(password, 12);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  user.refreshTokens = [];
  await user.save();

  clearAuthCookies(res);
  return success(res, { message: 'Mot de passe réinitialisé, connecte-toi maintenant' });
}