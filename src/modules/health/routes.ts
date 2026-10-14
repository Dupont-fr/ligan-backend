import { Router } from 'express';
import type { Request, Response } from 'express';
import { healthCheck } from './controller.js';

const router = Router();

router.get('/health', healthCheck);

// Route temporaire : récupère l'IP publique du serveur (pour whitelist SebPay).
router.get('/ip', async (_req: Request, res: Response) => {
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const data = (await r.json()) as { ip: string };
    res.json({ success: true, data: { ip: data.ip } });
  } catch {
    res.json({ success: false, data: { ip: 'inconnue — réessaie' } });
  }
});

export default router;