import { z } from 'zod';

export const createActivitySchema = z.object({
  title: z.string().trim().min(3, 'Le titre doit contenir au moins 3 caractères').max(120),
  description: z
    .string()
    .trim()
    .min(10, 'La description doit contenir au moins 10 caractères')
    .max(2000),
  category: z.string().trim().min(2, 'Catégorie requise').max(60),
  price: z.string().trim().max(60).optional().or(z.literal('')),
  location: z.string().trim().max(120).optional().or(z.literal('')),
});
export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const listActivitiesSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
});
export type ListActivitiesInput = z.infer<typeof listActivitiesSchema>;

export const idParamSchema = z.object({
  id: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Identifiant invalide'),
});
export type IdParam = z.infer<typeof idParamSchema>;
