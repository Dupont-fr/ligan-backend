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

// Route temporaire de diagnostic SebPay : montre la config effective et la
// liste des opérateurs telle que renvoyée par SebPay (depuis l'IP du serveur).
router.get('/sebpay-debug', async (_req: Request, res: Response) => {
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
});

// Route temporaire : teste plusieurs formats de payload de collecte SebPay et
// s'arrête dès que l'un est accepté. Permet d'identifier le format exact
// attendu par l'API sans deviner. À SUPPRIMER une fois le format trouvé.
router.get('/sebpay-probe', async (req: Request, res: Response) => {
  const env = (await import('../../config/env.js')).default;
  if (!env.payment.sebpayPublicKey || !env.payment.sebpaySecretKey) {
    return res.status(400).json({ success: false, message: 'Clés SebPay absentes' });
  }
  const phone = String(req.query.phone ?? '692763964');
  const operator = String(req.query.operator ?? 'orange-cm');
  const amount = Number(req.query.amount ?? 1000);
  const mode = String(req.query.mode ?? 'formats');
  try {
    const sebpay = await import('../../services/payments/sebpay.js');
    if (mode === 'info') {
      const results = await sebpay.probeSebpayInfo();
      return res.json({ success: true, data: { mode, results } });
    }
    if (mode === 'operators') {
      const country = String(req.query.country ?? 'CM');
      const result = await sebpay.probeSebpayOperators(country);
      return res.json({ success: true, data: { mode, country, ...result } });
    }
    const results =
      mode === 'params'
        ? await sebpay.probeCollectionParams(phone, operator, amount)
        : await sebpay.probeCollectionFormats(phone, operator, amount);
    const winner = results.find((r) => r.ok);
    return res.json({
      success: true,
      data: {
        mode,
        winner: winner ? winner.variant : null,
        results,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;