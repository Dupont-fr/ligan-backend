import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Page vue sur le site public.
 *
 * Aucune donnée personnelle : `visitorId` est une chaîne aléatoire générée par
 * le navigateur (localStorage), jamais dérivée de l'IP. Elle sert uniquement à
 * compter les visiteurs uniques d'une période.
 */
const visitSchema = new Schema({
  visitorId: { type: String, required: true, trim: true, maxlength: 64 },
  path: { type: String, required: true, trim: true, maxlength: 300 },
  /** Rétention 400 jours (> 365 jours affichés) via index TTL. */
  createdAt: { type: Date, default: Date.now, expires: 400 * 24 * 60 * 60 },
});

visitSchema.index({ createdAt: -1, visitorId: 1 });

export type VisitDocument = InferSchemaType<typeof visitSchema>;
export type VisitDoc = HydratedDocument<VisitDocument>;

export const Visit = model<VisitDocument>('Visit', visitSchema);
