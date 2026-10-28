import { z } from 'zod';

export const generateActivitySchema = z.object({
  prompt: z.string().trim().min(10, 'Décrivez votre activité en au moins 10 caractères').max(500),
});

export type GenerateActivityInput = z.infer<typeof generateActivitySchema>;
