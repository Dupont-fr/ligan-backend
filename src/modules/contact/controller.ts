import type { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import env from '../../config/env.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { success } from '../../utils/ApiResponse.js';
import { logger } from '../../utils/logger.js';
import type { ContactInput } from './validator.js';

const SUPPORT_EMAIL = 'support@ligan.plus';

function createTransport() {
  if (env.smtp.host && env.smtp.user && env.smtp.pass) {
    return nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
  }

  // Fallback dev : log uniquement
  return {
    sendMail: async (mail: unknown) => {
      logger.info(`[contact] email non envoyé (SMTP non configuré) : ${JSON.stringify(mail)}`);
      return { messageId: 'dev-log' };
    },
  } as unknown as { sendMail: (mail: unknown) => Promise<{ messageId: string }> };
}

const transporter = createTransport();

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

  try {
    await transporter.sendMail({
      from: env.smtp.from || `"LIGAN+" <${SUPPORT_EMAIL}>`,
      to: SUPPORT_EMAIL,
      replyTo: input.email,
      subject,
      text,
    });
  } catch (err) {
    logger.error(`Échec envoi mail contact : ${err instanceof Error ? err.message : err}`);
    throw new AppError('Impossible d’envoyer le message pour le moment. Réessayez plus tard.', 502);
  }

  return success(res, { message: 'Message envoyé avec succès.' });
}
