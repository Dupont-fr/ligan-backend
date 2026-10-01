import { z } from 'zod';
import { PAYMENT_NETWORKS } from '../../models/Payment.js';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Identifiant invalide');

export const checkoutSchema = z.object({
  planId: objectId,
  phoneNumber: z
    .string()
    .trim()
    .min(8, 'Numéro de téléphone invalide')
    .max(15, 'Numéro de téléphone invalide')
    .regex(/^\+?[0-9]+$/, 'Numéro de téléphone invalide (chiffres uniquement)'),
  network: z.enum(PAYMENT_NETWORKS, { message: 'Réseau invalide' }),
});

export const paymentIdParamSchema = z.object({ id: objectId });

export type CheckoutInput = z.infer<typeof checkoutSchema>;
