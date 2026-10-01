import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'EXPIRED', 'CANCELED'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

const subscriptionSchema = new Schema(
  {
    /** Abonnement rattaché au compte professionnel (1 pro = 1 abonnement). */
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'ACTIVE', index: true },
    startDate: { type: Date, required: true },
    /** Absent (undefined) = illimité — plan FREE. */
    endDate: { type: Date, default: undefined },
    activatedByPayment: { type: Schema.Types.ObjectId, ref: 'Payment', default: undefined },
  },
  { timestamps: true },
);

export type SubscriptionDocument = InferSchemaType<typeof subscriptionSchema>;
export type SubscriptionDoc = HydratedDocument<SubscriptionDocument>;

export interface PublicSubscription {
  id: string;
  status: SubscriptionStatus;
  startDate: string | Date;
  endDate?: string | Date;
  /** Jours restants (plan à durée limitée, calculé à la volée). */
  daysLeft?: number;
}

export function toPublicSubscription(doc: SubscriptionDoc): PublicSubscription {
  const now = Date.now();
  const daysLeft =
    doc.status === 'ACTIVE' && doc.endDate
      ? Math.max(0, Math.ceil((new Date(doc.endDate).getTime() - now) / 86400000))
      : undefined;
  return {
    id: String(doc._id),
    status: doc.status,
    startDate: doc.startDate,
    ...(doc.endDate ? { endDate: doc.endDate } : {}),
    ...(daysLeft !== undefined ? { daysLeft } : {}),
  };
}

export const Subscription = model<SubscriptionDocument>('Subscription', subscriptionSchema);
