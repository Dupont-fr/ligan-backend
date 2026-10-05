import { createHmac, timingSafeEqual } from 'node:crypto';
import { logger } from '../../utils/logger.js';
import env from '../../config/env.js';
import { Payment, type PaymentDoc } from '../../models/Payment.js';
import { Plan, type PlanCode, type PlanDoc } from '../../models/Plan.js';
import { Subscription, type SubscriptionDoc } from '../../models/Subscription.js';
import { mockProvider } from './mock.js';
import { sebpayProvider } from './sebpay.js';
import type { NormalizedStatus, PaymentProvider } from './provider.js';

export { ProviderError, normalizeStatus } from './provider.js';
export type { CreateTransactionInput, NormalizedStatus, PaymentProvider } from './provider.js';

let mockWarned = false;

/** SebPay si les clés sont présentes dans le `.env`, sinon simulation (mock). */
export function getPaymentProvider(): PaymentProvider {
  if (env.payment.sebpayPublicKey && env.payment.sebpaySecretKey) {
    return sebpayProvider;
  }
  if (!mockWarned) {
    mockWarned = true;
    logger.warn('SebPay non configuré (SEBPAY_PUBLIC_KEY / SEBPAY_SECRET_KEY vides) — paiements simulés (mock).');
  }
  return mockProvider;
}

export function isPaymentMock(): boolean {
  return !(env.payment.sebpayPublicKey && env.payment.sebpaySecretKey);
}

/**
 * Abonnement courant d'un compte — sans souscription valide, le plan est FREE.
 * Une souscription dont `endDate` est passé bascule en EXPIRED (lazy, à l'accès).
 */
export async function resolvePlan(userId: string): Promise<{
  plan: PlanDoc | null;
  code: PlanCode;
  subscription: SubscriptionDoc | null;
}> {
  const loaded = (await Subscription.findOne({ userId }).populate('planId')) as unknown as SubscriptionDoc | null;
  const sub = loaded;
  if (sub) {
    const plan = sub.planId as unknown as PlanDoc | null;
    const expired = sub.endDate !== undefined && sub.endDate !== null && new Date(sub.endDate).getTime() <= Date.now();
    if (sub.status === 'ACTIVE' && expired) {
      sub.status = 'EXPIRED';
      await sub.save();
    }
    if (sub.status === 'ACTIVE' && plan) {
      return { plan, code: plan.code, subscription: sub };
    }
  }
  const free = await Plan.findOne({ code: 'FREE', isActive: true });
  return { plan: free, code: free?.code ?? 'FREE', subscription: null };
}

/** Applique un résultat de paiement (idempotent) et active l'abonnement si succès. */
export async function applyPaymentResult(
  payment: PaymentDoc,
  status: NormalizedStatus,
  failureReason?: string,
): Promise<PaymentDoc> {
  if (payment.status === 'SUCCESSFUL') {
    return payment;
  }

  if (status === 'SUCCESSFUL') {
    payment.status = 'SUCCESSFUL';
    payment.paidAt = new Date();
    payment.failureReason = undefined;
    await payment.save();

    const plan = await Plan.findById(payment.planId);
    if (plan && plan.price > 0) {
      await activateSubscription(payment, plan);
      logger.info(`Paiement ${String(payment._id)} confirmé — abonnement ${plan.code} activé pour ${String(payment.userId)}`);
    }
    return payment;
  }

  if (status === 'FAILED' && payment.status !== 'FAILED') {
    payment.status = 'FAILED';
    payment.failureReason = failureReason ?? 'Paiement refusé par l’opérateur';
    await payment.save();
    logger.warn(`Paiement ${String(payment._id)} échoué : ${payment.failureReason}`);
  }
  return payment;
}

async function activateSubscription(payment: PaymentDoc, plan: PlanDoc): Promise<void> {
  const now = new Date();
  const endDate = plan.durationDays > 0 ? new Date(now.getTime() + plan.durationDays * 86_400_000) : null;
  const set: Record<string, unknown> = {
    planId: plan._id,
    status: 'ACTIVE',
    startDate: now,
    activatedByPayment: payment._id,
  };
  const update: Record<string, unknown> = { $set: set };
  if (endDate) {
    set.endDate = endDate;
  } else {
    update.$unset = { endDate: '' };
  }
  await Subscription.findOneAndUpdate({ userId: payment.userId }, update, { upsert: true });
}

/** Repasse un compte en plan FREE (illimité, aucun paiement). */
export async function downgradeToFree(userId: string): Promise<SubscriptionDoc | null> {
  const free = await Plan.findOne({ code: 'FREE', isActive: true });
  if (!free) {
    return null;
  }
  return Subscription.findOneAndUpdate(
    { userId },
    {
      $set: { planId: free._id, status: 'ACTIVE', startDate: new Date(), activatedByPayment: undefined },
      $unset: { endDate: '' },
    },
    { upsert: true, new: true },
  );
}

/**
 * Vérification de la signature SebPay (`X-SebPay-Signature` = HMAC-SHA256 du
 * corps brut signé avec la clé secrète ; hex ou base64 acceptés). Absente →
 * non vérifiable (« accepted »), le contrôle étant complété par la
 * re-vérification de la transaction auprès de l'API.
 */
export function verifyWebhookSignature(rawBody: Buffer | undefined, signature: string | undefined): 'valid' | 'invalid' | 'absent' {
  if (!signature) return 'absent';
  if (!rawBody || !env.payment.sebpaySecretKey) return 'invalid';
  const secret = env.payment.sebpaySecretKey;
  const pairs: Array<[string, string]> = [
    [createHmac('sha256', secret).update(rawBody).digest('hex'), signature.trim().toLowerCase()],
    [createHmac('sha256', secret).update(rawBody).digest('base64'), signature.trim()],
  ];
  for (const [expected, given] of pairs) {
    if (expected.length !== given.length) continue;
    try {
      if (timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return 'valid';
    } catch {
      /* pas ce format */
    }
  }
  return 'invalid';
}

/** Paiements récents d'un utilisateur (page abonnement). */
export async function listUserPayments(
  userId: string,
  limit = 5,
): Promise<Array<{ payment: PaymentDoc; plan: PlanDoc | null }>> {
  const payments = await Payment.find({ userId }).sort({ createdAt: -1 }).limit(limit).populate('planId');
  return payments.map((payment) => ({
    payment: payment as unknown as PaymentDoc,
    plan: (payment.planId as unknown as PlanDoc | null) ?? null,
  }));
}
