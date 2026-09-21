import type { NextFunction, Request, Response } from 'express';
import { failure } from '../utils/ApiResponse.js';

export class AppError extends Error {
  statusCode: number;
  errors?: Record<string, string>;

  constructor(message: string, statusCode = 500, errors?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

export function notFoundHandler(req: Request, res: Response) {
  return failure(res, `Route ${req.method} ${req.originalUrl} introuvable`, 404);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return failure(res, err.message, err.statusCode, err.errors);
  }

  const message = err instanceof Error ? err.message : 'Une erreur est survenue';
  console.error('[error]', err);
  return failure(res, 'Une erreur est survenue', 500, process.env.NODE_ENV !== 'production' ? { detail: message } : undefined);
}