import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 60 },
    parentId: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type CategoryDocument = InferSchemaType<typeof categorySchema>;
export type CategoryDoc = HydratedDocument<CategoryDocument>;

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  order: number;
  active: boolean;
}

export function toPublicCategory(doc: CategoryDoc): PublicCategory {
  return {
    id: doc._id.toString(),
    name: doc.name,
    slug: doc.slug,
    parentId: doc.parentId ? doc.parentId.toString() : null,
    order: doc.order,
    active: doc.active,
  };
}

export const Category = model<CategoryDocument>('Category', categorySchema);
