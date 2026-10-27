import type { Request, Response } from 'express';
import env from '../../config/env.js';
import { contactEmailBody, sendContactEmail } from '../../services/email.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { success } from '../../utils/ApiResponse.js';
import { logger } from '../../utils/logger.js';
import type { ContactInput } from './validator.js';

const SUPPORT_EMAIL = 'support@ligan.plus';

export async function sendContactMessage(req: Request, res: Response) {
  const input = req.validBody as ContactInput;

  const subject = `[LIGAN+] ${input.subject}`;
  const text = [
    'Message depuis le formulaire de contact LIGAN+',
    '---',
    `Nom : ${input.name}`,
    `Email : ${input.email}`,
    `Sujet : ${input.subject}`,
    '---',
    input.message,
  ].join('\n');

  // Doit recevoir vers l'email configuré avec Brevo (celui qui reçoit les codes de vérification)
  const recipient =
    process.env.CONTACT_RECEIVER ||
    process.env.BREVO_CONTACT_EMAIL ||
    env.email.from ||
    env.email.user ||
    env.email.to ||
    SUPPORT_EMAIL;

  try {
    const sent = await sendContactEmail({
      to: recipient,
      fromName: 'LIGAN+',
      replyTo: input.email,
      subject,
      preheader: `${input.name} vous a envoyé un message depuis le formulaire de contact`,
      bodyHtml: contactEmailBody(input.name, input.email, input.subject, input.message),
      bodyText: text,
    });

    if (!sent && (env.email.disabled || !env.email.apiKey)) {
      // Mode dev/log uniquement : on accepte tout de même pour ne pas bloquer l'UX en local
      logger.info(`[contact] envoyé en mode DEV/log uniquement vers ${recipient}`);
    } else if (!sent) {
      throw new AppError('Impossible d’envoyer le message pour le moment. Réessayez plus tard.', 502);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error(`Échec envoi mail contact : ${err instanceof Error ? err.message : err}`);
    throw new AppError('Impossible d’envoyer le message pour le moment. Réessayez plus tard.', 502);
  }

  return success(res, { message: 'Message envoyé avec succès.' });
}
