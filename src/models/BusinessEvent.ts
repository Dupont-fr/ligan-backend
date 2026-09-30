import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const BUSINESS_EVENT_TYPES = [
  'PROFILE_VIEW',
  'PHONE_CLICK',
  'WHATSAPP_CLICK',
  'DIRECTION_CLICK',
] as const;
export type BusinessEventType = (typeof BUSINESS_EVENT_TYPES)[number];

const businessEventSchema = new Schema(
  {
    activityId: { type: Schema.Types.ObjectId, ref: 'Activity', required: true },
    type: { type: String, enum: BUSINESS_EVENT_TYPES, required: true },
    /** Identifiant de session visiteur (déduplication côté client, jamais d'IP). */
    sessionId: { type: String, trim: true, maxlength: 64, default: undefined },
  },
  { timestamps: true },
);

businessEventSchema.index({ activityId: 1, type: 1, createdAt: -1 });

export type BusinessEventDocument = InferSchemaType<typeof businessEventSchema>;
export type BusinessEventDoc = HydratedDocument<BusinessEventDocument>;

export const BusinessEvent = model<BusinessEventDocument>('BusinessEvent', businessEventSchema);
