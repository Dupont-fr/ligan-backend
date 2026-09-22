import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { AppError } from '../../middlewares/errorHandler.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../middlewares/auth.js';
import {
  toPublicUser,
  User,
  type UserDocument,
} from '../../models/User.js';
import type { HydratedDocument } from 'mongoose';
import { sendResetPasswordEmail, sendVerificationEmail } from '../../services/email.js';
import { success } from '../../utils/ApiResponse.js';
import { logger } from '../../utils/logger.js';
import {
  createAccessToken,
  generateEmailCode,
  generateRefreshToken,
  hashValue,
} from '../../utils/tokens.js';
import env from '../../config/env.js';
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResendCodeInput,
  ResetPasswordInput,
  VerifyCodeInput,
  VerifyResetCodeInput,
} from './validator.js';

const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000;
const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
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

type UserDoc = HydratedDocument<UserDocument>;

type CodeField = 'verificationCode' | 'resetPasswordCode';

async function unsetCodeFields(userId: string, fields: string[]) {
  const unset: Record<string, 1> = {};
  for (const field of fields) {
    unset[field] = 1;
  }
  await User.updateOne({ _id: userId }, { $unset: unset });
}

async function openSession(user: UserDoc, res: Response) {
  const accessToken = createAccessToken({ id: user._id.toString(), role: user.role });
  const refreshToken = generateRefreshToken();
  await addRefreshToken(user._id.toString(), refreshToken);
  setAuthCookies(res, accessToken, refreshToken);
}

export async function register(req: Request, res: Response) {
  const { firstName, lastName, email, phone, password } = req.validBody as RegisterInput;

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError('Un compte existe déjà avec cette adresse email', 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const verificationCode = generateEmailCode();

  const user = await User.create({
    firstName,
    lastName,
    email,
    ...(phone ? { phone } : {}),
    passwordHash,
    isVerified: false,
    verificationCode: hashValue(verificationCode),
    verificationCodeExpires: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
    verificationAttempts: 0,
    refreshTokens: [],
  });

  await sendVerificationEmail(email, verificationCode);
  logger.info(`Compte créé pour ${email} (${user._id.toString()}) — en attente de vérification`);

  return success(res, { user: toPublicUser(user) }, 201);
}

export async function verifyCode(req: Request, res: Response) {
  const { email, code } = req.validBody as VerifyCodeInput;
  const hashed = hashValue(code);

  const user = await User.findOne({ email });
  if (!user || user.isVerified) {
    throw new AppError('Code invalide ou expiré', 400);
  }

  if (
    !user.verificationCode ||
    (user.verificationCodeExpires?.getTime() ?? 0) < Date.now() ||
    user.verificationCode !== hashed
  ) {
    await incrementAttempt(user, 'verificationAttempts', 'verificationCode');
    throw new AppError('Code invalide ou expiré', 400);
  }

  user.isVerified = true;
  user.verificationCode = undefined;
  user.verificationCodeExpires = undefined;
  user.verificationAttempts = 0;

  await openSession(user, res);
  await user.save();
  await unsetCodeFields(user._id.toString(), ['verificationCode']);
  logger.info(`Email vérifié et session ouverte pour ${email}`);

  return success(res, {
    user: toPublicUser(user),
    message: 'Compte vérifié, bienvenue !',
  });
}

export async function resendCode(req: Request, res: Response) {
  const { email, purpose } = req.validBody as ResendCodeInput;
  const message = 'Si le compte existe, un nouveau code a été envoyé.';

  const user = await User.findOne({ email });
  if (!user) {
    return success(res, { message });
  }

  if (purpose === 'verify') {
    if (user.isVerified) {
      return success(res, { message: 'Ce compte est déjà vérifié.' });
    }
    const code = generateEmailCode();
    user.verificationCode = hashValue(code);
    user.verificationCodeExpires = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
    user.verificationAttempts = 0;
    await user.save();
    await sendVerificationEmail(email, code);
    logger.info(`Nouveau code de vérification envoyé à ${email}`);
  } else {
    const code = generateEmailCode();
    user.resetPasswordCode = hashValue(code);
    user.resetPasswordCodeExpires = new Date(Date.now() + RESET_CODE_TTL_MS);
    user.resetAttempts = 0;
    await user.save();
    await sendResetPasswordEmail(email, code);
    logger.info(`Nouveau code de réinitialisation envoyé à ${email}`);
  }

  return success(res, { message });
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
    const code = generateEmailCode();
    user.verificationCode = hashValue(code);
    user.verificationCodeExpires = user.verificationCodeExpires =
      new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
    user.verificationAttempts = 0;
    await user.save();
    await sendVerificationEmail(email, code);
    logger.info(`Nouveau code de vérification envoyé à ${email} (tentative de connexion d'un compte non vérifié)`);
    throw new AppError('Compte non vérifié : un nouveau code vient de vous être envoyé par email', 403);
  }

  await openSession(user, res);
  logger.info(`Connexion réussie pour ${email}`);

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
  logger.info(`Déconnexion de ${req.user?.id ?? 'invité'}`);
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

async function incrementAttempt(
  user: UserDoc,
  attemptsField: 'verificationAttempts' | 'resetAttempts',
  codeField: CodeField,
) {
  const next = (user[attemptsField] ?? 0) + 1;
  user[attemptsField] = next;
  if (next >= MAX_CODE_ATTEMPTS) {
    user[codeField] = undefined;
    user[codeField === 'verificationCode' ? 'verificationCodeExpires' : 'resetPasswordCodeExpires'] =
      undefined;
    await unsetCodeFields(user._id.toString(), [
      codeField,
      codeField === 'verificationCode' ? 'verificationCodeExpires' : 'resetPasswordCodeExpires',
    ]);
    logger.warn(`Code invalidé après ${next} tentatives incorrectes pour ${user.email}`);
  }
  await user.save();
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.validBody as ForgotPasswordInput;
  const message =
    'Si un compte existe avec cette adresse email, un code de réinitialisation a été envoyé.';

  const user = await User.findOne({ email });
  if (user) {
    const code = generateEmailCode();
    user.resetPasswordCode = hashValue(code);
    user.resetPasswordCodeExpires = new Date(Date.now() + RESET_CODE_TTL_MS);
    user.resetAttempts = 0;
    await user.save();
    await sendResetPasswordEmail(email, code);
    logger.info(`Code de réinitialisation envoyé à ${email}`);
  }

  return success(res, { message });
}

export async function verifyResetCode(req: Request, res: Response) {
  const { email, code } = req.validBody as VerifyResetCodeInput;
  const hashed = hashValue(code);

  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError('Code invalide ou expiré', 400);
  }

if (
    !user.resetPasswordCode ||
    (user.resetPasswordCodeExpires?.getTime() ?? 0) < Date.now() ||
    user.resetPasswordCode !== hashed
  ) {
    await incrementAttempt(user, 'resetAttempts', 'resetPasswordCode');
    throw new AppError('Code invalide ou expiré', 400);
}

  return success(res, { message: 'Code valide' });
}

export async function resetPassword(req: Request, res: Response) {
  const { email, code, password } = req.validBody as ResetPasswordInput;
  const hashed = hashValue(code);

  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError('Code invalide ou expiré', 400);
  }

  if (
    !user.resetPasswordCode ||
    (user.resetPasswordCodeExpires?.getTime() ?? 0) < Date.now() ||
    user.resetPasswordCode !== hashed
  ) {
    await incrementAttempt(user, 'resetAttempts', 'resetPasswordCode');
    throw new AppError('Code invalide ou expiré', 400);
  }

  user.passwordHash = await bcrypt.hash(password, 12);
  user.resetPasswordCode = undefined;
  user.resetPasswordCodeExpires = undefined;
  user.resetAttempts = 0;
  user.refreshTokens = [];
  await user.save();
  await unsetCodeFields(user._id.toString(), ['resetPasswordCode', 'resetPasswordCodeExpires']);

  clearAuthCookies(res);
  logger.info(`Mot de passe réinitialisé pour ${email}`);

  return success(res, { message: 'Mot de passe réinitialisé, connecte-toi maintenant' });
}