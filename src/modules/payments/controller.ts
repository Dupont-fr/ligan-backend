import type { Request, Response } from 'express';
import { AppError } from '../../middlewares/errorHandler.js';
import { Payment } from '../../models/Payment.js';
import {
  applyPaymentResult,
  getPaymentProvider,
  normalizeStatus,
  verifyWebhookSignature,
} from '../../services/payments/index.js';
import { logger } from '../../utils/logger.js';
import { success } from '../../utils/ApiResponse.js';

type WebhookRequest = Request & { rawBody?: Buffer };

/**
 * Webhook FeexPay — reçoit le callback de confirmation d'une transaction.
 * Défense en profondeur : signature sha256 du corps (format SDK FeexPay),
 * contrôle du montant exact, puis re-vérification de la transaction auprès
 * du fournisseur avant toute activation d'abonnement.
 */
export async function feexpayWebhook(req: Request, res: Response) {
  const raw = (req as WebhookRequest).rawBody;
  const signature = req.header('X-Feexpay-Signature') ?? undefined;

  const signatureState = verifyWebhookSignature(raw, signature);
  if (signatureState === 'invalid') {
    logger.warn('Webhook FeexPay rejeté : signature invalide');
    throw new AppError('Signature invalide', 401);
  }

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const reference = String(body.reference ?? body.ref ?? body.transactionId ?? '').trim();
  if (!reference) {
    logger.warn('Webhook FeexPay sans référence de transaction — ignoré');
    return success(res, { message: 'ignoré' });
  }

  const payment = await Payment.findOne({ providerRef: reference });
  if (!payment) {
    logger.warn(`Webhook FeexPay : paiement inconnu (${reference}) — ignoré`);
    return success(res, { message: 'ignoré' });
  }
  if (payment.status === 'SUCCESSFUL') {
    return success(res, { message: 'déjà confirmé' });
  }

  const amount = Number(body.amount);
  if (Number.isFinite(amount) && amount !== payment.amount) {
    logger.warn(`Webhook FeexPay : montant incohérent pour ${reference} (${amount} ≠ ${payment.amount})`);
    throw new AppError('Montant incohérent', 400);
  }

  const provider = getPaymentProvider();
  if (payment.provider === provider.name && payment.providerRef) {
    try {
      const result = await provider.verify(payment.providerRef);
      await applyPaymentResult(payment, result.status);
    } catch (err) {
      logger.warn(
        `Webhook FeexPay : re-vérification impossible pour ${reference} — ${err instanceof Error ? err.message : err}`,
      );
    }
  } else {
    await applyPaymentResult(payment, normalizeStatus(body.status));
  }

  return success(res, { message: 'ok' });
}
