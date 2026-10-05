import type { PaymentProvider, TransactionResult, VerifyResult } from './provider.js';

/**
 * Fournisseur de simulation — utilisé tant que `SEBPAY_PUBLIC_KEY` /
 * `SEBPAY_SECRET_KEY` sont absents du `.env`. La transaction est créée en
 * PENDING puis confirmée au premier appel de vérification : le parcours
 * d'abonnement reste testable de bout en bout sans compte marchand.
 */
export const mockProvider: PaymentProvider = {
  name: 'MOCK',

  async createTransaction(input): Promise<TransactionResult> {
    return { providerRef: `mock_${input.reference}`, status: 'PENDING' };
  },

  async verify(): Promise<VerifyResult> {
    return { status: 'SUCCESSFUL' };
  },
};
