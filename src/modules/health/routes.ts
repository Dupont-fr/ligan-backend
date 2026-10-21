import { Router } from 'express';
import type { Request, Response } from 'express';
import { healthCheck } from './controller.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';

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

// Route de diagnostic SebPay : montre la config effective et la liste des
// opérateurs telle que renvoyée par SebPay (depuis l'IP du serveur).
// Réservée aux administrateurs.
router.get(
  '/sebpay-debug',
  requireAuth,
  requireRole('ADMIN'),
  async (_req: Request, res: Response) => {
    const env = (await import('../../config/env.js')).default;
    const out: Record<string, unknown> = {
      country: env.payment.sebpayCountry,
      currency: env.payment.sebpayCurrency,
      phoneCountryCode: env.payment.phoneCountryCode,
      publicApiUrl: env.payment.publicApiUrl || '(vide)',
      hasPublicKey: Boolean(env.payment.sebpayPublicKey),
      hasSecretKey: Boolean(env.payment.sebpaySecretKey),
      mock: process.env.PAYMENT_MOCK === '1',
    };
    try {
      const r = await fetch(
        `https://newapi.sebpay.bj/api/v1/operators?country=${env.payment.sebpayCountry}`,
        {
          headers: {
            'X-Public-Key': env.payment.sebpayPublicKey,
            'X-Secret-Key': env.payment.sebpaySecretKey,
            Accept: 'application/json',
          },
        },
      );
      out.operatorsHttpStatus = r.status;
      out.operatorsBody = await r.text();
    } catch (err) {
      out.operatorsError = err instanceof Error ? err.message : String(err);
    }
    res.json({ success: true, data: out });
  },
);

export default router;
