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

const hasValue = (v: unknown) => v !== undefined;

export const updateUserSchema = z
  .object({
    firstName: z.string().trim().min(2, 'Le prénom doit contenir au moins 2 caractères').max(60).optional(),
    lastName: z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères').max(60).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9\s().-]{8,20}$/, 'Numéro de téléphone invalide')
      .optional()
      .or(z.literal('')),
    role: z.enum(['CUSTOMER', 'PROFESSIONAL', 'ADMIN']).optional(),
    isVerified: z.boolean().optional(),
  })
  .refine(
    (v) => hasValue(v.firstName) || hasValue(v.lastName) || hasValue(v.phone) || hasValue(v.role) || hasValue(v.isVerified),
    'Au moins un champ à modifier',
  );
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const idParamSchema = z.object({
  id: z.string().trim().regex(objectIdRegex, 'Identifiant invalide'),
});
export type IdParam = z.infer<typeof idParamSchema>;

export const listActivitiesSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  professionalId: z.string().trim().regex(objectIdRegex, 'Identifiant invalide').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminActivitiesInput = z.infer<typeof listActivitiesSchema>;

export const setActivityStatusSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED']),
    reason: z.string().trim().min(3, 'Le motif doit contenir au moins 3 caractères').max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status !== 'APPROVED' && !v.reason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Le motif est obligatoire' });
    }
  });
export type SetActivityStatusInput = z.infer<typeof setActivityStatusSchema>;

export const listReviewsSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  activityId: z.string().trim().regex(objectIdRegex, 'Identifiant invalide').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminReviewsInput = z.infer<typeof listReviewsSchema>;

export const setReviewStatusSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string().trim().min(3, 'Le motif doit contenir au moins 3 caractères').max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status !== 'APPROVED' && !v.reason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Le motif est obligatoire' });
    }
  });
export type SetReviewStatusInput = z.infer<typeof setReviewStatusSchema>;

export const suspendUserSchema = z
  .object({
    suspended: z.boolean(),
    reason: z.string().trim().min(3, 'Le motif doit contenir au moins 3 caractères').max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.suspended && !v.reason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Le motif est obligatoire' });
    }
  });
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;
