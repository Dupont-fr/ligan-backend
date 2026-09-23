import env from '../config/env.js';
import { logger } from '../utils/logger.js';

interface MailInput {
  to: string;
  subject: string;
  preheader: string;
  bodyHtml: string;
  bodyText: string;
}

const EMAIL_MAX_WIDTH = '600px';
const BRAND_COLOR = '#4f46e5';
const VERIFICATION_CODE_TTL_MINUTES = 15;
const RESET_CODE_TTL_MINUTES = 15;

function frame({ preheader, bodyHtml, bodyText }: MailInput): { html: string; text: string } {
  const html = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="x-apple-disable-message-reformatting" content="true" />
    <title>${env.appName}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
    <div style="display:none;font-size:1px;color:#f8fafc;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;width:100%">
      <tr>
        <td align="center" style="padding:24px 12px 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${EMAIL_MAX_WIDTH};width:100%">
            <!-- Logo -->
            <tr>
              <td align="center" style="padding:0 0 20px">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center">
                      <span style="display:inline-block;width:40px;height:40px;line-height:40px;background-color:${BRAND_COLOR};border-radius:10px;color:#ffffff;font-size:20px;font-weight:700;text-align:center">+</span>
                      <div style="font-size:18px;font-weight:700;color:#0f172a;margin-top:8px">Ligan+</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Carte -->
            <tr>
              <td>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
                  <tr>
                    <td style="padding:32px 28px;background-color:#ffffff">
                      ${bodyHtml}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Pied de page -->
            <tr>
              <td align="center" style="padding:20px 12px 0">
                <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6">
                  © 2026 ${env.appName} — Découvrez des professionnels locaux qualifiés.<br />
                  Vous recevez cet email dans le cadre de la gestion de votre compte. Si ce n'est pas vous, ignorez ce message.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return { html, text: bodyText };
}

async function send(input: MailInput): Promise<boolean> {
  const { apiKey, user, from, fromName, disabled } = env.email;

  if (disabled || !apiKey) {
    logger.info(`(DEV) Email « ${input.subject} » à destination de ${input.to}`);
    console.log(`${input.bodyText}\n`);
    return false;
  }

  const sender = from && from.includes('@') ? from : user;
  const { html, text } = frame(input);

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: fromName, email: sender },
        to: [{ email: input.to }],
        subject: input.subject,
        htmlContent: html,
        textContent: text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Brevo API ${response.status}: ${body}`);
    }

    logger.info(`Email envoyé à ${input.to} : ${input.subject}`);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'erreur inconnue';
    logger.error(`Échec d'envoi d'email à ${input.to} : ${message}`);
    return false;
  }
}

function codeBox(hexColor: string, code: string, hint: string): string {
  const digits = code.split('');
  const cells = digits
    .map(
      (digit) =>
        `<span style="display:inline-block;min-width:40px;height:52px;line-height:52px;background-color:${hexColor};color:#ffffff;border-radius:8px;font-size:26px;font-weight:700;text-align:center;margin:0 4px">${digit}</span>`,
    )
    .join('');
  return `
    <div style="text-align:center;margin:24px 0 8px">${cells}</div>
    <p style="margin:8px 0 0;text-align:center;font-size:12px;color:#94a3b8">${hint}</p>
  `;
}

export async function sendVerificationEmail(to: string, code: string): Promise<boolean> {
  return send({
    to,
    subject: `Votre code de vérification — ${env.appName}`,
    preheader: `Votre code de vérification : ${code}`,
    bodyHtml: `
      <h1 style="margin:0 0 8px;font-size:22px;color:#0f172a;font-weight:700">Bienvenue sur ${env.appName} !</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.6">${env.appName} vous connecte aux professionnels locaux, près de chez vous. Pour activer votre compte, saisissez le code ci-dessous&nbsp;:</p>
      ${codeBox(BRAND_COLOR, code, `Ce code est valable pendant ${Math.round(VERIFICATION_CODE_TTL_MINUTES)} minutes.`)}
    `,
    bodyText: `Bienvenue sur ${env.appName} ! Votre code de vérification est : ${code}. Il expire dans ${Math.round(VERIFICATION_CODE_TTL_MINUTES)} minutes.`,
  });
}

export async function sendResetPasswordEmail(to: string, code: string): Promise<boolean> {
  return send({
    to,
    subject: `Votre code de réinitialisation — ${env.appName}`,
    preheader: `Votre code de réinitialisation : ${code}`,
    bodyHtml: `
      <h1 style="margin:0 0 8px;font-size:22px;color:#0f172a;font-weight:700">Réinitialisation du mot de passe</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.6">Vous avez demandé à définir un nouveau mot de passe ${env.appName}. Saisissez le code ci-dessous sur le site&nbsp;:</p>
      ${codeBox(BRAND_COLOR, code, `Ce code est valable pendant ${Math.round(RESET_CODE_TTL_MINUTES)} minutes.`)}
      <p style="margin:12px 0 0;font-size:13px;color:#94a3b8;line-height:1.6">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
    `,
    bodyText: `Réinitialisation de mot de passe ${env.appName} : votre code est ${code}. Il expire dans ${Math.round(RESET_CODE_TTL_MINUTES)} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
  });
}