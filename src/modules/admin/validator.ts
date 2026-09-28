import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const emailSchema = z.string().trim().toLowerCase().email('Adresse email invalide').max(254);
const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .max(128, 'Le mot de passe est trop long')
  .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
  .regex(/[0-9]|[^A-Za-z0-9]/, 'Le mot de passe doit contenir au moins un chiffre ou un caractère spécial');

export const createUserSchema = z.object({
  firstName: z.string().trim().min(2, 'Le prénom doit contenir au moins 2 caractères').max(60),
  lastName: z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères').max(60),
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s().-]{8,20}$/, 'Numéro de téléphone invalide')
    .optional()
    .or(z.literal('')),
  password: passwordSchema,
  role: z.enum(['CUSTOMER', 'PROFESSIONAL', 'ADMIN']).default('CUSTOMER'),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const idParamSchema = z.object({
  id: z.string().trim().regex(objectIdRegex, 'Identifiant invalide'),
});
export type IdParam = z.infer<typeof idParamSchema>;
