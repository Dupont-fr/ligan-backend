import { randomBytes } from 'node:crypto';
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const OPENING_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export type OpeningDay = (typeof OPENING_DAYS)[number];

export const ACTIVITY_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

const serviceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    price: { type: String, trim: true, maxlength: 60, default: undefined },
  },
  { _id: false },
);

const openingHourSchema = new Schema(
  {
    day: { type: String, enum: OPENING_DAYS, required: true },
    open: { type: String, required: true, trim: true, maxlength: 5 },
    close: { type: String, required: true, trim: true, maxlength: 5 },
    closed: { type: Boolean, default: false },
  },
  { _id: false },
);

const activitySchema = new Schema(
  {
    professionalId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    slug: { type: String, trim: true, lowercase: true, maxlength: 80, unique: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    category: { type: String, required: true, trim: true, maxlength: 60 },
    price: { type: String, trim: true, maxlength: 60, default: undefined },
    location: { type: String, trim: true, maxlength: 120, default: undefined },
    services: { type: [serviceSchema], default: [] },
    contacts: {
      type: new Schema(
        {
          phone: { type: String, trim: true, maxlength: 30, default: undefined },
          whatsapp: { type: String, trim: true, maxlength: 30, default: undefined },
          email: { type: String, trim: true, lowercase: true, maxlength: 254, default: undefined },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    openingHours: { type: [openingHourSchema], default: [] },
    address: {
      type: new Schema(
        {
          city: { type: String, trim: true, maxlength: 80, default: undefined },
          district: { type: String, trim: true, maxlength: 80, default: undefined },
          street: { type: String, trim: true, maxlength: 120, default: undefined },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    photos: { type: [String], default: [] },
    /** Modération (Sprint 9) : seules les activités APPROVED sont visibles publiquement. */
    status: { type: String, enum: ACTIVITY_STATUSES, default: 'PENDING', index: true },
    moderationReason: { type: String, trim: true, maxlength: 500, default: undefined },
    moderatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: undefined },
    moderatedAt: { type: Date, default: undefined },
    /** Point GeoJSON [longitude, latitude] — champ absent si position inconnue (index 2dsphere). */
    geo: {
      type: new Schema(
        {
          type: { type: String, enum: ['Point'], default: 'Point' },
          coordinates: { type: [Number], required: true },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true },
);

activitySchema.index({ geo: '2dsphere' });
// Sprint 15 — index composés couvrant les filtres/tris de la recherche et
// des rangées récentes : $match { status, category/city } puis tri createdAt.
activitySchema.index({ status: 1, category: 1 });
activitySchema.index({ status: 1, 'address.city': 1 });
activitySchema.index({ status: 1, createdAt: -1 });
activitySchema.index({ status: 1, professionalId: 1 });

/** Garantit un slug à chaque écriture (couvre les créations sans slug). */
activitySchema.pre('save', async function () {
  if (!this.slug) {
    this.slug = await generateUniqueSlug(this.title);
  }
});

export type ActivityDocument = InferSchemaType<typeof activitySchema>;
export type ActivityDoc = HydratedDocument<ActivityDocument>;

interface PopulatedProfessional {
  _id: unknown;
  firstName: string;
  lastName: string;
}

export interface PublicActivity {
  id: string;
  slug?: string;
  title: string;
  description: string;
  category: string;
  price?: string;
  location?: string;
  services: Array<{ name: string; price?: string }>;
  contacts: { phone?: string; whatsapp?: string; email?: string };
  openingHours: Array<{ day: string; open: string; close: string; closed: boolean }>;
  address: { city?: string; district?: string; street?: string };
  photos: string[];
  latitude?: number;
  longitude?: number;
  status: ActivityStatus;
  moderationReason?: string;
  professional?: { id: string; firstName: string; lastName: string };
  createdAt: Date;
}

export function toPublicActivity(doc: ActivityDoc | (ActivityDocument & { _id: unknown })): PublicActivity {
  const raw = doc as ActivityDoc & { professionalId: unknown };
  const pro = raw.professionalId;
  const isPopulated =
    pro !== null && typeof pro === 'object' && '_id' in (pro as object);

  const contacts = raw.contacts as ActivityDocument['contacts'] | undefined;
  const address = raw.address as ActivityDocument['address'] | undefined;
  const services = (raw.services ?? []).map((s) => ({
    name: s.name,
    ...(s.price ? { price: s.price } : {}),
  }));

  return {
    id: String(raw._id),
    ...(raw.slug ? { slug: raw.slug } : {}),
    title: raw.title,
    description: raw.description,
    category: raw.category,
    ...(raw.price ? { price: raw.price } : {}),
    ...(raw.location ? { location: raw.location } : {}),
    services,
    contacts: {
      ...(contacts?.phone ? { phone: contacts.phone } : {}),
      ...(contacts?.whatsapp ? { whatsapp: contacts.whatsapp } : {}),
      ...(contacts?.email ? { email: contacts.email } : {}),
    },
    openingHours: (raw.openingHours ?? []).map((h) => ({
      day: h.day,
      open: h.open,
      close: h.close,
      closed: Boolean(h.closed),
    })),
    address: {
      ...(address?.city ? { city: address.city } : {}),
      ...(address?.district ? { district: address.district } : {}),
      ...(address?.street ? { street: address.street } : {}),
    },
    photos: raw.photos ?? [],
    status: (raw.status as ActivityStatus | undefined) ?? 'APPROVED',
    ...(raw.moderationReason ? { moderationReason: raw.moderationReason } : {}),
    ...(raw.geo?.coordinates?.length === 2
      ? { longitude: raw.geo.coordinates[0], latitude: raw.geo.coordinates[1] }
      : {}),
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

/** Titre → slug URL : minuscules, sans accents, tirets. */
export function slugifyActivityTitle(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '');
  return base || 'activite';
}

/** Slug unique : base, puis suffixe aléatoire en cas de collision. */
export async function generateUniqueSlug(title: string): Promise<string> {
  const base = slugifyActivityTitle(title);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate =
      attempt === 0 ? base : `${base}-${randomBytes(3).toString('hex')}`.slice(0, 80).replace(/-+$/g, '');
    const exists = await Activity.exists({ slug: candidate });
    if (!exists) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 80);
}
