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

interface SebPayOperator {
  name?: string;
  slug?: string;
  otp_required?: boolean;
  ussd_code?: string;
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

  const rawText = await res.text().catch(() => '');
  let payload: SebPayEnvelope<T> | null = null;
  try {
    payload = JSON.parse(rawText) as SebPayEnvelope<T>;
  } catch {
    /* réponse sans corps JSON */
  }
  if (!res.ok || payload?.success === false) {
    const providerMessage = payload?.message ?? '';
    // Log brut : sans lui, SebPay masque le motif réel derrière un 502 générique
    // (« Failed to initiate collection » n'indique ni le champ ni la valeur fautive).
    logger.error(
      `SebPay ${method} ${path} → HTTP ${res.status} | ${providerMessage || '(pas de message)'} | corps: ${rawText.slice(0, 800)}`,
    );
    throw new ProviderError(providerMessage || `SebPay a répondu ${res.status}`, 502);
  }
  if (!payload?.data) {
    throw new ProviderError('Réponse vide du service SebPay', 502);
  }
  return payload.data;
}

/**
 * Format international attendu par SebPay : E.164 avec « + » (ex. +237692763964).
 * Le numéro local (9 chiffres, sans indicatif) est préfixé par l'indicatif pays
 * (PHONE_COUNTRY_CODE, ex. 237 pour le Cameroun) ; un numéro déjà international
 * (avec « + » ou plus long que 9 chiffres) est normalisé en +XXXXXXXXXXX.
 */
function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }
  const hasCountryCode = digits.length > 9;
  if (hasCountryCode) {
    return `+${digits}`;
  }
  return `+${env.payment.phoneCountryCode}${digits}`;
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
    const phone = normalizePhone(input.phoneNumber);
    const operatorCode = input.network.replace(/-.*$/, '').toUpperCase();
    const payload: Record<string, unknown> = {
      amount: input.amount,
      currency: env.payment.sebpayCurrency,
      phone,
      operator: operatorCode,
      country: env.payment.sebpayCountry,
      external_reference: input.reference,
      customer: {
        phone,
        provider: operatorCode,
      },
      ...(input.otpCode ? { otp_code: input.otpCode } : {}),
      ...(env.payment.publicApiUrl
        ? { callback_url: `${env.payment.publicApiUrl}/api/payments/webhook` }
        : {}),
    };
    const data = await request<SebPayCollection>('POST', '/api/v1/collections', payload);
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

export interface PaymentOperator {
  slug: string;
  name: string;
  otpRequired: boolean;
  ussdCode: string | null;
}

/** Opérateurs actifs du pays du compte marchand (GET /operators?country=…). */
export async function fetchSebPayOperators(): Promise<PaymentOperator[]> {
  const data = await request<SebPayOperator[]>('GET', `/api/v1/operators?country=${env.payment.sebpayCountry}`);
  if (!Array.isArray(data)) return [];
  return data
    .filter((op): op is SebPayOperator & { slug: string } => typeof op.slug === 'string' && op.slug.length > 0)
    .map((op) => ({
      slug: op.slug,
      name: typeof op.name === 'string' && op.name ? op.name : op.slug.toUpperCase(),
      otpRequired: op.otp_required === true,
      ussdCode: typeof op.ussd_code === 'string' && op.ussd_code ? op.ussd_code : null,
    }));
}
