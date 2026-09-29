import { z } from 'zod';

export const businessSlugSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug invalide')
    .max(80),
});
export type BusinessSlugParam = z.infer<typeof businessSlugSchema>;

/** Paramètre booléen en query string : `true`/`false` (undefined si absent). */
const boolParam = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

/** Recherche géolocalisée (Sprint 5) + filtres et tri (Sprint 6). */
export const businessSearchSchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    category: z.string().trim().max(60).optional(),
    city: z.string().trim().max(80).optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    radius: z.coerce.number().min(100, 'Rayon minimum 100 m').max(100000, 'Rayon maximum 100 km').optional(),
    sort: z.enum(['recent', 'distance', 'name']).optional(),
    openNow: boolParam,
    hasPhotos: boolParam,
    verified: boolParam,
    limit: z.coerce.number().int().min(1).max(50).default(20),
    page: z.coerce.number().int().min(1).max(100).default(1),
  })
  .refine(
    (data) =>
      (typeof data.latitude === 'number' && typeof data.longitude === 'number') ||
      (data.latitude === undefined && data.longitude === undefined),
    { message: 'Latitude et longitude doivent être fournies ensemble', path: ['latitude'] },
  );
export type BusinessSearchInput = z.infer<typeof businessSearchSchema>;
