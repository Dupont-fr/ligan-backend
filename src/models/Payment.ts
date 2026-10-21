import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const PAYMENT_STATUSES = ['PENDING', 'SUCCESSFUL', 'FAILED', 'EXPIRED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Slug d'opérateur mobile money tel que fourni par SebPay (ex. « orange-cm »,
 * « mtn-cm »). Volontairement libre : la liste des opérateurs varie par pays.
 */
export type PaymentNetwork = string;

const paymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
    /** Montant exact attendu en FCFA (re-vérifié au webhook pour éviter le spoofing). */
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'XAF' },
    provider: { type: String, enum: ['SEBPAY', 'MOCK'], required: true },
    /** Référence côté fournisseur (SebPay `transaction_id`) — clé de rapprochement du webhook. */
    providerRef: { type: String, index: true, unique: true, sparse: true },
    network: { type: String, trim: true, maxlength: 40, default: undefined },
    phoneNumber: { type: String, trim: true, maxlength: 30, default: undefined },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'PENDING', index: true },
    failureReason: { type: String, trim: true, maxlength: 300, default: undefined },
    /** Corps brut de la réponse du fournisseur en cas d'échec (diagnostic SebPay). */
    providerRaw: { type: String, maxlength: 2000, default: undefined },
    paidAt: { type: Date, default: undefined },
  },
  { timestamps: true },
);

// Sprint 15 — historique des revenus (paiements réussis par date de paiement).
paymentSchema.index({ status: 1, paidAt: -1 });

export type PaymentDocument = InferSchemaType<typeof paymentSchema>;
export type PaymentDoc = HydratedDocument<PaymentDocument>;

export const Payment = model<PaymentDocument>('Payment', paymentSchema);
