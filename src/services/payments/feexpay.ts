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

const BASE_URL = 'https://api.feexpay.me';
const TIMEOUT_MS = 20_000;

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.payment.feexpayApiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    logger.error(`FeexPay injoignable : ${err instanceof Error ? err.message : String(err)}`);
    throw new ProviderError('Le service de paiement est momentanément injoignable', 502);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* réponse sans corps */
  }
  if (!res.ok) {
    const providerMessage =
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message?: unknown }).message ?? '')
        : '';
    throw new ProviderError(providerMessage || `FeexPay a répondu ${res.status}`, 502);
  }
  return data as T;
}

interface FeexpayCreateResponse {
  reference?: string;
  ref?: string;
  id?: string;
  status?: string;
}

/**
 * Fournisseur FeexPay — API REST directe (api.feexpay.me) :
 * - POST /api/transactions/public/requesttopay/{network}
 * - GET  /api/transactions/getrequesttopay/integration/{reference}
 */
export const feexpayProvider: PaymentProvider = {
  name: 'FEEXPAY',

  async createTransaction(input: CreateTransactionInput): Promise<TransactionResult> {
    const data = await request<FeexpayCreateResponse>('POST', `/api/transactions/public/requesttopay/${input.network}`, {
      amount: input.amount,
      shop: env.payment.feexpayShopId,
      phoneNumber: input.phoneNumber,
      network: input.network,
      motif: input.motif ?? 'Abonnement LIGAN+',
      callback_info: input.reference,
      ...(input.firstName ? { first_name: input.firstName } : {}),
      ...(input.lastName ? { last_name: input.lastName } : {}),
      ...(input.email ? { email: input.email } : {}),
    });
    const providerRef = data.reference ?? data.ref ?? data.id;
    if (!providerRef) {
      throw new ProviderError('Référence de transaction absente de la réponse FeexPay', 502);
    }
    return { providerRef: String(providerRef), status: normalizeStatus(data.status), raw: data };
  },

  async verify(providerRef: string): Promise<VerifyResult> {
    const data = await request<{ status?: string }>(
      'GET',
      `/api/transactions/getrequesttopay/integration/${encodeURIComponent(providerRef)}`,
    );
    return { status: normalizeStatus(data.status), raw: data };
  },
};
