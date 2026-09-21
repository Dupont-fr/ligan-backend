import type { Request, Response } from 'express';
import { success } from '../../utils/ApiResponse.js';
import { getDbState } from '../../config/database.js';
import env from '../../config/env.js';

export function healthCheck(_req: Request, res: Response) {
  const db = getDbState();

  return success(res, {
    app: env.appName,
    status: 'ok',
    env: env.nodeEnv,
    version: '0.1.0',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    db,
  });
}