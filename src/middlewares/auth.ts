import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '../models/User.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { AppError } from './errorHandler.js';

export const ACCESS_COOKIE = 'ligan_access';
export const REFRESH_COOKIE = 'ligan_refresh';

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) {
    return next(new AppError('Authentification requise', 401));
  }

  try {
    req.user = verifyAccessToken(token);
    return next();
  } catch {
    return next(new AppError('Session expirée ou invalide', 401));
  }
}

/**
 * Peuple `req.user` si une session valide existe, sans exiger de session.
 * Sert aux routes mixtes (ex : `GET /api/categories?all=1` = public,
 * mais la variante `all=1` n'est réservée qu'aux ADMIN).
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (token) {
    try {
      req.user = verifyAccessToken(token);
    } catch {
      // Session expirée : on traite la requête comme anonyme.
    }
  }
  return next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('Accès refusé', 403));
    }
    return next();
  };
}