import { z } from 'zod';

export const createSolicitationSchema = z.object({
  toProfessionalId: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Identifiant invalide'),
  activityId: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{24}$/, 'Identifiant invalide')
    .optional()
    .or(z.literal('')),
  message: z
    .string()
    .trim()
    .min(10, 'Le message doit contenir au moins 10 caractères')
    .max(1000),
});
export type CreateSolicitationInput = z.infer<typeof createSolicitationSchema>;

export const updateSolicitationSchema = z.object({
  status: z.enum(['ACCEPTED', 'DECLINED']),
});
export type UpdateSolicitationInput = z.infer<typeof updateSolicitationSchema>;

export const solicitationIdParamSchema = z.object({
  id: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Identifiant invalide'),
});
export type SolicitationIdParam = z.infer<typeof solicitationIdParamSchema>;
