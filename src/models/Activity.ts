import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const activitySchema = new Schema(
  {
    professionalId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    category: { type: String, required: true, trim: true, maxlength: 60 },
    price: { type: String, trim: true, maxlength: 60, default: undefined },
    location: { type: String, trim: true, maxlength: 120, default: undefined },
  },
  { timestamps: true },
);

export type ActivityDocument = InferSchemaType<typeof activitySchema>;
export type ActivityDoc = HydratedDocument<ActivityDocument>;

interface PopulatedProfessional {
  _id: unknown;
  firstName: string;
  lastName: string;
}

export interface PublicActivity {
  id: string;
  title: string;
  description: string;
  category: string;
  price?: string;
  location?: string;
  professional?: { id: string; firstName: string; lastName: string };
  createdAt: Date;
}

export function toPublicActivity(doc: ActivityDoc | (ActivityDocument & { _id: unknown })): PublicActivity {
  const raw = doc as ActivityDoc & { professionalId: unknown };
  const pro = raw.professionalId;
  const isPopulated =
    pro !== null && typeof pro === 'object' && '_id' in (pro as object);

  return {
    id: String(raw._id),
    title: raw.title,
    description: raw.description,
    category: raw.category,
    ...(raw.price ? { price: raw.price } : {}),
    ...(raw.location ? { location: raw.location } : {}),
    ...(pro
      ? isPopulated
        ? {
            professional: {
              id: String((pro as unknown as PopulatedProfessional)._id),
              firstName: (pro as unknown as PopulatedProfessional).firstName,
              lastName: (pro as unknown as PopulatedProfessional).lastName,
            },
          }
        : { professional: { id: String(pro), firstName: '', lastName: '' } }
      : {}),
    createdAt: (raw as ActivityDocument & { createdAt: Date }).createdAt,
  };
}

export const Activity = model<ActivityDocument>('Activity', activitySchema);
