import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const SOLICITATION_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED'] as const;
export type SolicitationStatus = (typeof SOLICITATION_STATUSES)[number];

const solicitationSchema = new Schema(
  {
    fromId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    toId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    activityId: { type: Schema.Types.ObjectId, ref: 'Activity', default: undefined },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: SOLICITATION_STATUSES, default: 'PENDING' },
  },
  { timestamps: true },
);

export type SolicitationDocument = InferSchemaType<typeof solicitationSchema>;
export type SolicitationDoc = HydratedDocument<SolicitationDocument>;

interface Person {
  _id: unknown;
  firstName: string;
  lastName: string;
}

export interface PublicSolicitation {
  id: string;
  message: string;
  status: SolicitationStatus;
  from?: { id: string; firstName: string; lastName: string };
  to?: { id: string; firstName: string; lastName: string };
  createdAt: Date;
}

function toPerson(value: unknown): { id: string; firstName: string; lastName: string } | undefined {
  if (!value) return undefined;
  if (typeof value === 'object' && '_id' in (value as Person)) {
    const p = value as Person;
    return { id: String(p._id), firstName: p.firstName, lastName: p.lastName };
  }
  return { id: String(value), firstName: '', lastName: '' };
}

export function toPublicSolicitation(doc: SolicitationDoc): PublicSolicitation {
  const raw = doc as SolicitationDoc & { fromId: unknown; toId: unknown };
  const from = toPerson(raw.fromId);
  const to = toPerson(raw.toId);
  return {
    id: String(raw._id),
    message: raw.message,
    status: raw.status,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    createdAt: raw.createdAt,
  };
}

export const Solicitation = model<SolicitationDocument>('Solicitation', solicitationSchema);
