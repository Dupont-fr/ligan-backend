import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Identifiant invalide');

export const checkoutSchema = z.object({
  planId: objectId,
  /** Téléphone : 9 chiffres, sans indicatif (le code pays est ajouté au paiement). */
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\d{9}$/, 'Le numéro de téléphone doit contenir 9 chiffres'),
  /** Slug d'opérateur SebPay (ex. « orange-cm ») — voir GET /api/payments/operators. */
  network: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/, 'Réseau invalide'),
  /** Code OTP (opérateurs exigeant une confirmation USSD, ex. Orange CI). */
  otpCode: z
    .string()
    .trim()
    .regex(/^\d{4,12}$/, 'Code OTP invalide (4 à 12 chiffres)')
    .optional(),
});

export const paymentIdParamSchema = z.object({ id: objectId });

export type CheckoutInput = z.infer<typeof checkoutSchema>;
