import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const phoneRegex = /^\+?[0-9\s().-]{8,20}$/;
/** Photos : URL Cloudinary (upload fait côté client) ou fichier local legacy /uploads/. */
const photoUrlRegex = /^(https:\/\/res\.cloudinary\.com\/[A-Za-z0-9/_.-]+|\/uploads\/[A-Za-z0-9._-]+)$/;

const serviceSchema = z.object({
  name: z.string().trim().min(2, 'Le service doit contenir au moins 2 caractères').max(80),
  price: z.string().trim().max(60).optional().or(z.literal('')),
});
export type ServiceInput = z.infer<typeof serviceSchema>;

const openingHourSchema = z.object({
  day: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
  open: z.string().regex(timeRegex, 'Format HH:MM attendu'),
  close: z.string().regex(timeRegex, 'Format HH:MM attendu'),
  closed: z.boolean().default(false),
});
export type OpeningHourInput = z.infer<typeof openingHourSchema>;

const contactsSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, 'Numéro de téléphone invalide'),
  whatsapp: z
    .string()
    .trim()
    .regex(phoneRegex, 'Numéro WhatsApp invalide')
    .optional()
    .or(z.literal('')),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Adresse email invalide')
    .max(254)
    .optional()
    .or(z.literal('')),
});
export type ContactsInput = z.infer<typeof contactsSchema>;

const addressSchema = z.object({
  city: z.string().trim().min(2, 'La ville est requise').max(80),
  district: z.string().trim().max(80).optional().or(z.literal('')),
  street: z.string().trim().max(120).optional().or(z.literal('')),
});
export type AddressInput = z.infer<typeof addressSchema>;

/** Corps complet envoyé par le wizard (création et modification). */
export const activityBodySchema = z.object({
  title: z.string().trim().min(3, 'Le titre doit contenir au moins 3 caractères').max(120),
  description: z
    .string()
    .trim()
    .min(10, 'La description doit contenir au moins 10 caractères')
    .max(2000),
  category: z.string().trim().min(2, 'Catégorie requise').max(60),
  price: z.string().trim().max(60).optional().or(z.literal('')),
  location: z.string().trim().max(120).optional().or(z.literal('')),
  services: z.array(serviceSchema).max(20, '20 services maximum').default([]),
  contacts: contactsSchema,
  openingHours: z
    .array(openingHourSchema)
    .max(7, '7 jours maximum')
    .refine((hours) => hours.length >= 1, 'Indiquez au moins un jour d’ouverture')
    .refine(
      (hours) => new Set(hours.map((h) => h.day)).size === hours.length,
      'Chaque jour ne doit apparaître qu’une seule fois',
    ),
  address: addressSchema,
  photos: z
    .array(z.string().trim().regex(photoUrlRegex, 'URL de photo invalide'))
    .max(8, '8 photos maximum')
    .default([]),
});
export type ActivityBodyInput = z.infer<typeof activityBodySchema>;

export const createActivitySchema = activityBodySchema;
export const updateActivitySchema = activityBodySchema;

export const listActivitiesSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
});
export type ListActivitiesInput = z.infer<typeof listActivitiesSchema>;

export const idParamSchema = z.object({
  id: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Identifiant invalide'),
});
export type IdParam = z.infer<typeof idParamSchema>;
