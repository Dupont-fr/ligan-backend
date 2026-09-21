import type { AuthUser } from '../models/User.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      validBody?: Record<string, unknown>;
      validQuery?: Record<string, unknown>;
      validParams?: Record<string, unknown>;
    }
  }
}

export {};