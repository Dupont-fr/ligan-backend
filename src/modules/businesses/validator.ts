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
