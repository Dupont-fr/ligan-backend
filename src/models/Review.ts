import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

const reviewSchema = new Schema(
  {
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    activityId: { type: Schema.Types.ObjectId, ref: 'Activity', required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true, minlength: 10, maxlength: 1000 },
    status: { type: String, enum: REVIEW_STATUSES, default: 'PENDING', index: true },
    /** Modération (Sprint 9 reportée au Sprint 11) */
    moderationReason: { type: String, trim: true, maxlength: 500, default: undefined },
    moderatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: undefined },
    moderatedAt: { type: Date, default: undefined },
  },
  { timestamps: true },
);

// Un seul avis par utilisateur et par activité.
reviewSchema.index({ reviewerId: 1, activityId: 1 }, { unique: true });
reviewSchema.index({ activityId: 1, status: 1, createdAt: -1 });

export type ReviewDocument = InferSchemaType<typeof reviewSchema>;
export type ReviewDoc = HydratedDocument<ReviewDocument>;

export interface PublicReview {
  id: string;
  rating: number;
  comment: string;
  status?: ReviewStatus;
  moderationReason?: string;
  createdAt: string | Date;
  reviewer?: { id?: string; firstName: string; lastName: string };
  activity?: { id: string; title: string; slug?: string };
}

/** Avis public : identité limitée au prénom + nom (initiale exposée côté client si besoin). */
export function toPublicReview(
  doc: ReviewDoc | (ReviewDocument & { _id: unknown }),
  opts: { withStatus?: boolean } = {},
): PublicReview {
  const d = doc as ReviewDocument & {
    _id: unknown;
    reviewerId?: { _id?: unknown; firstName?: string; lastName?: string } | unknown;
    activityId?: { _id?: unknown; title?: string; slug?: string } | unknown;
  };
  const reviewer =
    d.reviewerId && typeof d.reviewerId === 'object' && 'firstName' in d.reviewerId
      ? {
          id: (d.reviewerId as { _id?: unknown })._id ? String((d.reviewerId as { _id: unknown })._id) : undefined,
          firstName: String((d.reviewerId as { firstName?: string }).firstName ?? ''),
          lastName: String((d.reviewerId as { lastName?: string }).lastName ?? ''),
        }
      : undefined;
  const activity =
    d.activityId && typeof d.activityId === 'object' && 'title' in d.activityId
      ? {
          id: String((d.activityId as { _id?: unknown })._id ?? ''),
          title: String((d.activityId as { title?: string }).title ?? ''),
          slug: (d.activityId as { slug?: string }).slug,
        }
      : undefined;

  return {
    id: String(d._id),
    rating: d.rating,
    comment: d.comment,
    ...(opts.withStatus ? { status: d.status as ReviewStatus } : {}),
    ...(opts.withStatus && d.moderationReason ? { moderationReason: d.moderationReason } : {}),
    createdAt: d.createdAt,
    ...(reviewer ? { reviewer } : {}),
    ...(activity ? { activity } : {}),
  };
}

export const Review = model<ReviewDocument>('Review', reviewSchema);
