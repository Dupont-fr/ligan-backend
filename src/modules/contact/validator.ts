import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(254);

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Indiquez votre nom.').max(80),
  email: emailSchema,
  subject: z.enum([
    'Question générale',
    'Devenir professionnel',
    'Mon compte',
    'Paiements et abonnements',
    'Signaler un problème',
    'Partenariat',
  ]),
  message: z.string().trim().min(10, 'Décrivez votre demande (10 caractères minimum).').max(2000),
});

export type ContactInput = z.infer<typeof contactSchema>;
