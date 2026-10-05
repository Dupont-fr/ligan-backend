import type { Request, Response } from 'express';
import { AppError } from '../../middlewares/errorHandler.js';
import { Payment, type PaymentDoc } from '../../models/Payment.js';
import { Plan, toPublicPlan } from '../../models/Plan.js';
import { toPublicSubscription } from '../../models/Subscription.js';
import { User } from '../../models/User.js';
import {
  ProviderError,
  applyPaymentResult,
  downgradeToFree,
  getPaymentProvider,
  isPaymentMock,
  listUserPayments,
  resolvePlan,
} from '../../services/payments/index.js';
import { logger } from '../../utils/logger.js';
import { success } from '../../utils/ApiResponse.js';
import type { CheckoutInput } from './validator.js';

/** Abonnement + plan courant + historique des paiements du compte pro connecté. */
export async function mySubscription(req: Request, res: Response) {
  const userId = String(req.user?.id);
  const { plan, code, subscription } = await resolvePlan(userId);
  const entries = await listUserPayments(userId);

  return success(res, {
    plan: plan ? toPublicPlan(plan) : null,
    planCode: code,
    subscription: subscription ? toPublicSubscription(subscription) : null,
    payments: entries.map(({ payment, plan: paymentPlan }) => ({
      id: String(payment._id),
      planCode: paymentPlan?.code ?? '',
      planName: paymentPlan?.name ?? '',
      amount: payment.amount,
      currency: payment.currency,
      network: payment.network ?? null,
      status: payment.status,
      failureReason: payment.failureReason ?? null,
      createdAt: payment.createdAt,
    })),
    mock: isPaymentMock(),
  });
}

/**
 * Démarre un paiement SebPay pour un plan payant : crée le Payment PENDING
 * puis demande la collection au fournisseur (mock tant que les clés manquent).
 */
export async function checkout(req: Request, res: Response) {
  const userId = String(req.user?.id);
  const input = req.validBody as CheckoutInput;

  const plan = await Plan.findOne({ _id: input.planId, isActive: true });
  if (!plan) {
    throw new AppError('Plan introuvable', 404);
  }
  if (plan.price <= 0) {
    throw new AppError('Le plan FREE est déjà inclus : aucun paiement requis', 422);
  }

  const provider = getPaymentProvider();
  const payment = await Payment.create({
    userId,
    planId: plan._id,
    amount: plan.price,
    provider: provider.name,
    network: input.network,
    phoneNumber: input.phoneNumber,
  });

  let providerLink: string | undefined;
  try {
    const user = await User.findById(userId).select('firstName lastName email');
    const result = await provider.createTransaction({
      amount: plan.price,
      reference: String(payment._id),
      phoneNumber: input.phoneNumber,
      network: input.network,
      firstName: user?.firstName,
      lastName: user?.lastName,
      email: user?.email,
      motif: `Abonnement ${plan.name} — LIGAN+`,
      otpCode: input.otpCode,
    });
    payment.providerRef = result.providerRef;
    await payment.save();
    providerLink = result.redirectUrl;
    if (result.status !== 'PENDING') {
      await applyPaymentResult(payment, result.status);
    }
  } catch (err) {
    payment.status = 'FAILED';
    payment.failureReason =
      err instanceof Error ? err.message.slice(0, 300) : 'Échec de l’initialisation du paiement';
    await payment.save();
    logger.warn(`Checkout échoué (${String(payment._id)}) : ${payment.failureReason}`);
    if (err instanceof ProviderError) {
      throw new AppError(err.message, err.httpStatus);
    }
    throw err;
  }

  return success(
    res,
    {
      payment: toPublicPayment(payment, plan),
      providerLink: providerLink ?? null,
      mock: isPaymentMock(),
    },
    201,
  );
}

function toPublicPayment(payment: PaymentDoc | null, plan?: InstanceType<typeof Plan> | null) {
  if (!payment) return null;
  return {
    id: String(payment._id),
    planCode: plan?.code ?? '',
    planName: plan?.name ?? '',
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    providerRef: payment.providerRef ?? null,
    network: payment.network ?? null,
    failureReason: payment.failureReason ?? null,
    createdAt: payment.createdAt,
  };
}

/**
 * Sondage côté client : re-vérifie la transaction auprès du fournisseur si
 * elle est encore PENDING, renvoie le statut courant.
 */
export async function paymentStatus(req: Request, res: Response) {
  const userId = String(req.user?.id);
  const { id } = req.validParams as { id: string };

  const payment = await Payment.findById(id);
  if (!payment) {
    throw new AppError('Paiement introuvable', 404);
  }
  if (String(payment.userId) !== userId) {
    throw new AppError('Accès refusé', 403);
  }

  if (payment.status === 'PENDING') {
    const provider = getPaymentProvider();
    if (payment.providerRef && payment.provider === provider.name) {
      try {
        const result = await provider.verify(payment.providerRef);
        await applyPaymentResult(payment, result.status);
      } catch (err) {
        logger.warn(`Vérification du paiement ${String(payment._id)} impossible : ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  const fresh = await Payment.findById(payment._id);
  const plan = fresh ? await Plan.findById(fresh.planId) : null;
  return success(res, { payment: toPublicPayment(fresh, plan) });
}

/** Repasse le compte en plan FREE (illimité, gratuit). */
export async function downgrade(req: Request, res: Response) {
  const userId = String(req.user?.id);
  const sub = await downgradeToFree(userId);
  if (!sub) {
    throw new AppError('Plan FREE indisponible : contactez le support', 422);
  }
  const { plan, code, subscription } = await resolvePlan(userId);
  return success(res, {
    plan: plan ? toPublicPlan(plan) : null,
    planCode: code,
    subscription: subscription ? toPublicSubscription(subscription) : null,
  });
}
