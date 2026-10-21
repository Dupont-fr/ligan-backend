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
  const raw = await rawRequest(method, path, body);
  let payload: SebPayEnvelope<T> | null = null;
  try {
    payload = JSON.parse(raw.body) as SebPayEnvelope<T>;
  } catch {
    /* réponse sans corps JSON */
  }
  if (!raw.ok || payload?.success === false) {
    const providerMessage = payload?.message ?? '';
    // Log brut : sans lui, SebPay masque le motif réel derrière un 502 générique
    // (« Failed to initiate collection » n'indique ni le champ ni la valeur fautive).
    logger.error(
      `SebPay ${method} ${path} → HTTP ${raw.status} | ${providerMessage || '(pas de message)'} | corps: ${raw.body.slice(0, 800)}`,
    );
    throw new ProviderError(providerMessage || `SebPay a répondu ${raw.status}`, 502);
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
      phone: phoneDigits,
      operator: input.network,
      external_reference: input.reference,
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

/* ---------------------------------------------------------------------------
 * Sonde de format (temporaire)
 *
 * SebPay peut refuser une collecte pour un simple écart de format (numéro
 * local vs international, slug d'opérateur vs code, champs optionnels…).
 * Plutôt que de deviner, on essaie plusieurs combinaisons et on s'arrête dès
 * qu'une passe : la variante qui fonctionne est celle qu'on Retient en dur.
 * ------------------------------------------------------------------------- */

export interface SebPayProbeResult {
  variant: number;
  label: string;
  status: number;
  ok: boolean;
  body: string;
}

export async function probeCollectionFormats(
  phone: string,
  operatorSlug: string,
  amount = 1000,
): Promise<SebPayProbeResult[]> {
  const local = phone.replace(/\D/g, '').slice(-9);
  const intl = `${env.payment.phoneCountryCode}${local}`;
  const code = operatorSlug.replace(/-.*$/, '').toUpperCase();
  const slug = operatorSlug;

  const common = {
    amount,
    currency: env.payment.sebpayCurrency,
    external_reference: `probe-${Date.now()}`,
  };
  const callback = env.payment.publicApiUrl
    ? { callback_url: `${env.payment.publicApiUrl}/api/payments/webhook` }
    : {};
  const country = { country: env.payment.sebpayCountry };

  const variants: { label: string; payload: Record<string, unknown> }[] = [
    {
      label: 'numéro local + slug opérateur + pays + devise',
      payload: { ...common, ...country, ...callback, phone: local, operator: slug },
    },
    {
      label: 'numéro international avec + + slug opérateur + pays + devise',
      payload: { ...common, ...country, ...callback, phone: `+${intl}`, operator: slug },
    },
    {
      label: 'numéro international sans + + code opérateur (MAJUSCULES) + pays + devise',
      payload: { ...common, ...country, ...callback, phone: intl, operator: code },
    },
    {
      label: 'numéro local + code opérateur (MAJUSCULES) + pays + devise',
      payload: { ...common, ...country, ...callback, phone: local, operator: code },
    },
    {
      label: 'numéro international avec + + code opérateur (MAJUSCULES) + pays + devise',
      payload: { ...common, ...country, ...callback, phone: `+${intl}`, operator: code },
    },
    {
      label: 'numéro international avec + + code opérateur, sans pays',
      payload: { ...common, ...callback, phone: `+${intl}`, operator: code },
    },
    {
      label: 'numéro local + slug opérateur, sans pays',
      payload: { ...common, ...callback, phone: local, operator: slug },
    },
    {
      label: 'objet customer imbriqué (phone + provider)',
      payload: {
        ...common,
        ...country,
        ...callback,
        customer: { phone: `+${intl}`, provider: code },
      },
    },
    {
      label: 'objet customer imbriqué + slug opérateur',
      payload: {
        ...common,
        ...country,
        ...callback,
        customer: { phone: `+${intl}`, provider: slug },
      },
    },
  ];

  const results: SebPayProbeResult[] = [];
  for (const [index, variant] of variants.entries()) {
    const res = await rawRequest('POST', '/api/v1/collections', variant.payload);
    results.push({
      variant: index + 1,
      label: variant.label,
      status: res.status,
      ok: res.ok,
      body: res.body.slice(0, 600),
    });
    if (res.ok) break;
  }
  return results;
}
