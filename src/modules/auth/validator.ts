import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().email('Adresse email invalide').max(254);
const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .max(128, 'Le mot de passe est trop long')
  .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
  .regex(/[0-9]|[^A-Za-z0-9]/, 'Le mot de passe doit contenir au moins un chiffre ou un caractère spécial');
const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Le code doit contenir exactement 6 chiffres');

export const registerSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, 'Le prénom doit contenir au moins 2 caractères')
    .max(60, 'Le prénom est trop long'),
  lastName: z
    .string()
    .trim()
    .min(2, 'Le nom doit contenir au moins 2 caractères')
    .max(60, 'Le nom est trop long'),
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s().-]{8,20}$/, 'Numéro de téléphone invalide')
    .optional()
    .or(z.literal('')),
  password: passwordSchema,
  role: z.enum(['CUSTOMER', 'PROFESSIONAL']).default('CUSTOMER'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Le mot de passe est requis').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyCodeSchema = z.object({
  email: emailSchema,
  code: codeSchema,
});
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resendCodeSchema = z.object({
  email: emailSchema,
  purpose: z.enum(['verify', 'reset']),
});
export type ResendCodeInput = z.infer<typeof resendCodeSchema>;

export const verifyResetCodeSchema = z.object({
  email: emailSchema,
  code: codeSchema,
});
export type VerifyResetCodeInput = z.infer<typeof verifyResetCodeSchema>;

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: codeSchema,
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;