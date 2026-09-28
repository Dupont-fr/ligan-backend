import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const categorySlugSchema = z
  .string()
  .trim()
  .min(2, 'Slug trop court')
  .max(60)
  .regex(slugRegex, 'Slug invalide (minuscules, chiffres et tirets)');

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères').max(60),
  slug: categorySlugSchema,
  parentId: z.string().trim().regex(objectIdRegex, 'Identifiant invalide').nullish(),
  order: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, 'Aucune modification fournie');
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const listCategoriesSchema = z.object({
  all: z.enum(['0', '1']).optional(),
});
export type ListCategoriesInput = z.infer<typeof listCategoriesSchema>;

export const idParamSchema = z.object({
  id: z.string().trim().regex(objectIdRegex, 'Identifiant invalide'),
});
export type IdParam = z.infer<typeof idParamSchema>;
