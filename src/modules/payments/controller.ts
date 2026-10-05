import type { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { AppError } from '../../middlewares/errorHandler.js';
import { Payment, type PaymentDoc } from '../../models/Payment.js';
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
 * Webhook SebPay — reçoit le callback de confirmation d'une collection.
 * Défense en profondeur : signature HMAC-SHA256 du corps (`X-SebPay-Signature`),
 * contrôle du montant exact, puis re-vérification de la transaction auprès
 * de l'API avant toute activation d'abonnement.
 */
export async function sebpayWebhook(req: Request, res: Response) {
  const raw = (req as WebhookRequest).rawBody;
  const signature = req.header('X-SebPay-Signature') ?? undefined;

  const signatureState = verifyWebhookSignature(raw, signature);
  if (signatureState === 'invalid') {
    logger.warn('Webhook SebPay rejeté : signature invalide');
    throw new AppError('Signature invalide', 401);
  }

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const externalRef = String(body.external_reference ?? '').trim();
  const transactionId = String(body.transaction_id ?? '').trim();

  let payment: PaymentDoc | null = null;
  if (externalRef && isValidObjectId(externalRef)) {
    payment = await Payment.findById(externalRef);
  }
  if (!payment && transactionId) {
    payment = await Payment.findOne({ providerRef: transactionId });
  }
  if (!payment) {
    logger.warn(`Webhook SebPay : paiement inconnu (${externalRef || transactionId || 'sans référence'}) — ignoré`);
    return success(res, { message: 'ignoré' });
  }
  if (payment.status === 'SUCCESSFUL') {
    return success(res, { message: 'déjà confirmé' });
  }

  const amount = Number(body.amount);
  if (Number.isFinite(amount) && amount !== payment.amount) {
    logger.warn(`Webhook SebPay : montant incohérent pour ${externalRef} (${amount} ≠ ${payment.amount})`);
    throw new AppError('Montant incohérent', 400);
  }

  const provider = getPaymentProvider();
  if (payment.provider === provider.name && payment.providerRef) {
    try {
      const result = await provider.verify(payment.providerRef);
      await applyPaymentResult(payment, result.status);
    } catch (err) {
      logger.warn(
        `Webhook SebPay : re-vérification impossible pour ${externalRef} — ${err instanceof Error ? err.message : err}`,
      );
    }
  } else {
    await applyPaymentResult(payment, normalizeStatus(body.status));
  }

  return success(res, { message: 'ok' });
}
