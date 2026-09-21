import jwt, { type SignOptions } from 'jsonwebtoken';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import env from '../config/env.js';
import type { AuthUser, UserRole } from '../models/User.js';

export function createAccessToken(user: AuthUser): string {
  const options: SignOptions = {
    subject: user.id,
    expiresIn: env.accessTokenTtl as SignOptions['expiresIn'],
  };
  return jwt.sign({ role: user.role }, env.jwtSecret, options);
}

export function verifyAccessToken(token: string): AuthUser {
  const payload = jwt.verify(token, env.jwtSecret) as {
    sub?: string;
    role?: UserRole;
  };
  if (!payload.sub || !payload.role) {
    throw new Error('Jeton invalide');
  }
  return { id: payload.sub, role: payload.role };
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('hex');
}

export function generateEmailCode(): string {
  return randomInt(100000, 1000000).toString();
}

export function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}