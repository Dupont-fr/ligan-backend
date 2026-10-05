import env from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import {
  ProviderError,
  normalizeStatus,
  type CreateTransactionInput,
  type PaymentProvider,
  type TransactionResult,
  type VerifyResult,
} from './provider.js';

const BASE_URL = 'https://newapi.sebpay.bj';
const TIMEOUT_MS = 20_000;

/** Enveloppe standard SebPay : { success, data, message }. */
interface SebPayEnvelope<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

interface SebPayCollection {
  transaction_id?: string;
  status?: string;
  provider_link?: string;
  external_reference?: string;
  message?: string;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'X-Public-Key': env.payment.sebpayPublicKey,
        'X-Secret-Key': env.payment.sebpaySecretKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    logger.error(`SebPay injoignable : ${err instanceof Error ? err.message : String(err)}`);
    throw new ProviderError('Le service de paiement est momentanément injoignable', 502);
  }

  let payload: SebPayEnvelope<T> | null = null;
  try {
    payload = (await res.json()) as SebPayEnvelope<T>;
  } catch {
    /* réponse sans corps */
  }
  if (!res.ok || payload?.success === false) {
    const providerMessage = payload?.message ?? '';
    throw new ProviderError(providerMessage || `SebPay a répondu ${res.status}`, 502);
  }
  if (!payload?.data) {
    throw new ProviderError('Réponse vide du service SebPay', 502);
  }
  return payload.data;
}

/** Format international attendu par SebPay : chiffres uniquement, sans « + ». */
function normalizePhone(phone: string): string {
  return phone.replace(/^\+/, '').replace(/[\s().-]/g, '');
}

/**
 * Fournisseur SebPay — API REST directe (newapi.sebpay.bj) :
 * - POST /api/v1/collections            (création d'une collecte mobile money)
 * - GET  /api/v1/collections/{id_or_ref} (statut)
 * Le webhook de confirmation est passé en `callback_url` quand PUBLIC_API_URL est défini.
 */
export const sebpayProvider: PaymentProvider = {
  name: 'SEBPAY',

  async createTransaction(input: CreateTransactionInput): Promise<TransactionResult> {
    const data = await request<SebPayCollection>('POST', '/api/v1/collections', {
      amount: input.amount,
      currency: env.payment.sebpayCurrency,
      phone: normalizePhone(input.phoneNumber),
      operator: input.network,
      country: env.payment.sebpayCountry,
      external_reference: input.reference,
      ...(env.payment.publicApiUrl
        ? { callback_url: `${env.payment.publicApiUrl}/api/payments/webhook` }
        : {}),
    });
    if (!data.transaction_id) {
      throw new ProviderError('Référence de transaction absente de la réponse SebPay', 502);
    }
    return {
      providerRef: String(data.transaction_id),
      status: normalizeStatus(data.status),
      redirectUrl: data.provider_link || undefined,
      raw: data,
    };
  },

  async verify(providerRef: string): Promise<VerifyResult> {
    const data = await request<SebPayCollection>(
      'GET',
      `/api/v1/collections/${encodeURIComponent(providerRef)}`,
    );
    return { status: normalizeStatus(data.status), raw: data };
  },
};
