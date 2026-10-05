export type PaymentProviderName = 'SEBPAY' | 'MOCK';

export interface CreateTransactionInput {
  /** Montant en FCFA. */
  amount: number;
  /** Notre référence interne (paymentId) — envoyée comme `external_reference`. */
  reference: string;
  phoneNumber: string;
  network: 'mtn' | 'orange';
  firstName?: string;
  lastName?: string;
  email?: string;
  motif?: string;
}

export type NormalizedStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED';

export type TransactionResult = {
  providerRef: string;
  status: NormalizedStatus;
  /** Lien de validation SebPay (provider_link) — à ouvrir par le client si présent. */
  redirectUrl?: string;
  raw?: unknown;
};

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

/** Statuts SebPay (approved/rejected/pending, diverses casse/formes) → statut interne. */
export function normalizeStatus(value: unknown): NormalizedStatus {
  const v = String(value ?? '')
    .toUpperCase()
    .trim();
  if (['SUCCESSFUL', 'SUCCESS', 'ACCEPTED', 'APPROVED', 'COMPLETE', 'COMPLETED'].includes(v)) return 'SUCCESSFUL';
  if (['FAILED', 'FAILURE', 'REFUSED', 'CANCELLED', 'CANCELED', 'REJECTED'].includes(v)) return 'FAILED';
  return 'PENDING';
}
