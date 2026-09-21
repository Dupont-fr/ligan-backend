import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { AppError } from './errorHandler.js';

export type ValidationSource = 'body' | 'query' | 'params';

export function validate<T>(schema: ZodType<T>, source: ValidationSource = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.length > 0 ? issue.path.join('.') : issue.code;
        if (!errors[key]) {
          errors[key] = issue.message;
        }
      }
      return next(new AppError('Données invalides', 400, errors));
    }

    const target: 'validBody' | 'validQuery' | 'validParams' =
      source === 'body' ? 'validBody' : source === 'query' ? 'validQuery' : 'validParams';
    req[target] = result.data as Record<string, unknown>;
    return next();
  };
}