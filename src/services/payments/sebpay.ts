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
  errors?: { code?: string };
}

/**
 * Messages d'erreur SebPay → message français exploitable côté client.
 * Les codes sont ceux observés sur l'API (vérifiés par sonde) :
 * PAYMENT_DECLINED, VALIDATION_ERROR, IP_NOT_ALLOWED, EXTERNAL_REFERENCE_CONFLICT.
 */
const SEBPAY_ERROR_MESSAGES: Record<string, string> = {
  PAYMENT_DECLINED:
    "Paiement refusé par l'opérateur mobile money : vérifiez que le numéro correspond bien à l'opérateur choisi (MTN ou Orange) et réessayez plus tard — les demandes répétées sur un même numéro sont souvent bloquées temporairement par l'opérateur.",
  VALIDATION_ERROR:
    'Données de paiement invalides selon SebPay (configuration ou format de la requête).',
  IP_NOT_ALLOWED:
    "L'adresse IP du serveur n'est pas autorisée par SebPay. Contactez le support SebPay pour whitelister l'IP.",
  EXTERNAL_REFERENCE_CONFLICT:
    'Cette référence de paiement a déjà été utilisée avec des paramètres différents.',
  INTERNAL_ERROR:
    'Erreur interne SebPay. Réessayez dans quelques instants.',
};

function sebpayErrorMessage(code: string | undefined, fallback: string, status?: number): string {
  if (code && SEBPAY_ERROR_MESSAGES[code]) return SEBPAY_ERROR_MESSAGES[code];
  // SebPay ne renvoie pas toujours de code d'erreur : un 422 signifie toujours
  // « payload rejeté à la validation ».
  if (status === 422) return SEBPAY_ERROR_MESSAGES.VALIDATION_ERROR;
  if (status === 409) return SEBPAY_ERROR_MESSAGES.EXTERNAL_REFERENCE_CONFLICT;
  if (status === 403) return SEBPAY_ERROR_MESSAGES.IP_NOT_ALLOWED;
  return fallback;
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

/** Dernier échange (requête/réponse) avec SebPay : indispensable au diagnostic. */
interface SebPayExchange {
  at: string;
  method: string;
  path: string;
  status: number;
  body: string;
}

let lastExchange: SebPayExchange | null = null;

/** Dernier appel SebPay (requête + réponse brute), pour la route de diagnostic. */
export function getLastSebPayExchange(): SebPayExchange | null {
  return lastExchange;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const raw = await rawRequest(method, path, body);
  lastExchange = {
    at: new Date().toISOString(),
    method,
    path,
    status: raw.status,
    body: raw.body.slice(0, 2000),
  };
  let payload: SebPayEnvelope<T> | null = null;
  try {
    payload = JSON.parse(raw.body) as SebPayEnvelope<T>;
  } catch {
    /* réponse sans corps JSON */
  }
  if (!raw.ok || payload?.success === false) {
    const providerMessage = payload?.message ?? '';
    const providerCode = payload?.errors?.code;
    // Log brut : sans lui, SebPay masque le motif réel derrière un 502 générique
    // (« Failed to initiate collection » n'indique ni le champ ni la valeur fautive).
    logger.error(
      `SebPay ${method} ${path} → HTTP ${raw.status} | ${providerMessage || '(pas de message)'} | code: ${providerCode || '-'} | corps: ${raw.body.slice(0, 800)}`,
    );
    const fallback = providerMessage || `SebPay a répondu ${raw.status}`;
    throw new ProviderError(
      sebpayErrorMessage(providerCode, fallback, raw.status),
      502,
      raw.body.slice(0, 2000),
    );
  }
  if (!payload?.data) {
    throw new ProviderError('Réponse vide du service SebPay', 502);
  }
  return payload.data;
}

/** Appel brut vers l'API SebPay : jamais d'exception, toujours le statut + le corps. */
async function rawRequest(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; ok: boolean; body: string }> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
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
    const text = await res.text().catch(() => '');
    return { status: res.status, ok: res.ok, body: text };
  } catch (err) {
    return {
      status: 0,
      ok: false,
      body: `ERREUR RESEAU : ${err instanceof Error ? err.message : String(err)}`,
    };
  }
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
    const phoneDigits = phone.replace(/^\+/, '');
    const payload: Record<string, unknown> = {
      amount: input.amount,
      currency: env.payment.sebpayCurrency,
      // OBLIGATOIRE : sans `country`, l'API SebPay répond 422 « Validation Error. »
      // (vérifié par sonde multi-formats sur les 6 combinaisons opérateur/téléphone).
      country: env.payment.sebpayCountry,
      phone: phoneDigits,
      operator: input.network,
      // OBLIGATOIRE : SebPay rejette la collecte sans external_reference.
      external_reference: input.reference,
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

