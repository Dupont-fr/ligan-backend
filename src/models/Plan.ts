import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const PLAN_CODES = ['FREE', 'PRO', 'PREMIUM'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

const planSchema = new Schema(
  {
    code: { type: String, enum: PLAN_CODES, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    /** Prix en FCFA — modifiable uniquement par un admin (jamais codé en dur côté client). */
    price: { type: Number, required: true, min: 0 },
    /** Durée d'activation après paiement — 0 = illimité (FREE). */
    durationDays: { type: Number, required: true, min: 0 },
    /** Descriptif des bénéfices (informatif jusqu'au sprint 14 « Premium et visibilité »). */
    features: { type: [String], default: [] },
    /** Plan mis en avant visuellement dans le catalogue. */
    highlight: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type PlanDocument = InferSchemaType<typeof planSchema>;
export type PlanDoc = HydratedDocument<PlanDocument>;

export interface PublicPlan {
  id: string;
  code: PlanCode;
  name: string;
  price: number;
  durationDays: number;
  features: string[];
  highlight: boolean;
  order: number;
}

export function toPublicPlan(doc: PlanDoc): PublicPlan {
  return {
    id: String(doc._id),
    code: doc.code,
    name: doc.name,
    price: doc.price,
    durationDays: doc.durationDays,
    features: doc.features ?? [],
    highlight: doc.highlight ?? false,
    order: doc.order ?? 0,
  };
}

export const Plan = model<PlanDocument>('Plan', planSchema);
