import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const createReviewSchema = z.object({
  activityId: z.string().trim().regex(objectIdRegex, 'Identifiant invalide'),
  rating: z.coerce
    .number()
    .int('La note doit être un nombre entier')
    .min(1, 'La note doit être comprise entre 1 et 5')
    .max(5, 'La note doit être comprise entre 1 et 5'),
  comment: z
    .string()
    .trim()
    .min(10, 'Le commentaire doit contenir au moins 10 caractères')
    .max(1000, 'Le commentaire ne peut pas dépasser 1000 caractères'),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const idParamSchema = z.object({
  id: z.string().trim().regex(objectIdRegex, 'Identifiant invalide'),
});
export type IdParam = z.infer<typeof idParamSchema>;
