export type PaymentProviderName = 'FEEXPAY' | 'MOCK';

export interface CreateTransactionInput {
  /** Montant en FCFA. */
  amount: number;
  /** Notre référence interne (paymentId) — remontée dans `callback_info`. */
  reference: string;
  phoneNumber: string;
  network: 'mtn' | 'orange';
  firstName?: string;
  lastName?: string;
  email?: string;
  motif?: string;
}

export type NormalizedStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED';

export interface TransactionResult {
  providerRef: string;
  status: NormalizedStatus;
  raw?: unknown;
}

export interface VerifyResult {
  status: NormalizedStatus;
  raw?: unknown;
}

/**
 * Abstraction fournisseur de paiement (Sprint 12/13) — l'application ne
 * dépend jamais directement d'un agrégateur, seul ce contrat est utilisé.
 */
export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createTransaction(input: CreateTransactionInput): Promise<TransactionResult>;
  /** Re-vérification systématique auprès du fournisseur (webhook inclus). */
  verify(providerRef: string): Promise<VerifyResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly httpStatus = 502,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Statuts FeexPay (diverses casse/formes) → statut normalisé interne. */
export function normalizeStatus(value: unknown): NormalizedStatus {
  const v = String(value ?? '')
    .toUpperCase()
    .trim();
  if (['SUCCESSFUL', 'SUCCESS', 'ACCEPTED', 'COMPLETE', 'COMPLETED'].includes(v)) return 'SUCCESSFUL';
  if (['FAILED', 'FAILURE', 'REFUSED', 'CANCELLED', 'CANCELED', 'REJECTED'].includes(v)) return 'FAILED';
  return 'PENDING';
}
