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
/* Chartes LIGAN+ — mêmes valeurs que frontend/src/index.css (@theme). */
const BRAND_RED = '#e50914';
const COLOR_PRIMARY = '#f68b1e';
const COLOR_TEXT = '#313133';
const COLOR_TEXT_SECONDARY = '#75757a';
const COLOR_TEXT_MUTED = '#a3a3a6';
const COLOR_BG = '#f1f1f2';
const COLOR_SURFACE = '#ffffff';
const COLOR_BORDER = '#e8e8e8';
const VERIFICATION_CODE_TTL_MINUTES = 15;
const RESET_CODE_TTL_MINUTES = 15;

export function frame({ preheader, bodyHtml, bodyText }: MailInput): { html: string; text: string } {
  const html = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="x-apple-disable-message-reformatting" content="true" />
    <title>${env.appName}</title>
    <style>
      /* Mobile : carte plus étroite et chiffres du code réduits — le code
         tient sur UNE seule ligne dès 320px (les clients qui ignorent cette
         balise <style> reçoivent déjà des tailles compatibles 320px). */
      @media only screen and (max-width:480px) {
        .lg-wrap { padding: 16px 8px 24px !important; }
        .lg-card { padding: 24px 16px !important; }
        .lg-code {
          min-width: 30px !important;
          height: 44px !important;
          line-height: 44px !important;
          font-size: 21px !important;
          margin: 0 2px !important;
        }
        .lg-h1 { font-size: 20px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${COLOR_BG};font-family:'Ubuntu','Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
    <div style="display:none;font-size:1px;color:${COLOR_BG};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR_BG};width:100%">
      <tr>
        <td align="center" class="lg-wrap" style="padding:24px 12px 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${EMAIL_MAX_WIDTH};width:100%">
            <!-- Logo -->
            <tr>
              <td align="center" style="padding:0 0 20px">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center">
                      <span style="display:inline-block;width:40px;height:40px;line-height:40px;background-color:${COLOR_TEXT};border-radius:10px;color:#ffffff;font-size:20px;font-weight:900;font-style:italic;text-align:center">L<span style="font-size:155%;color:${BRAND_RED}">+</span></span>
                      <div style="font-size:18px;font-weight:900;font-style:italic;color:${COLOR_TEXT};margin-top:8px;letter-spacing:-0.5px">LIGAN<span style="font-size:155%;color:${BRAND_RED}">+</span></div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Carte -->
            <tr>
              <td>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR_SURFACE};border-radius:16px;overflow:hidden;border:1px solid ${COLOR_BORDER}">
                  <tr>
                    <td class="lg-card" style="padding:32px 28px;background-color:${COLOR_SURFACE}">
                      ${bodyHtml}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Pied de page -->
            <tr>
              <td align="center" style="padding:20px 12px 0">
                <p style="margin:0;font-size:12px;color:${COLOR_TEXT_MUTED};line-height:1.6">
                  © 2026 ${env.appName} — Trouvez les professionnels près de vous.<br />
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

/** Boîtes de chiffres du code — orange primaire, sur une seule ligne (nowrap). */
export function codeBox(hexColor: string, code: string, hint: string): string {
  const cells = code
    .split('')
    .map(
      (digit) =>
        `<span class="lg-code" style="display:inline-block;min-width:34px;height:48px;line-height:48px;background-color:${hexColor};color:#ffffff;border-radius:8px;font-size:22px;font-weight:700;text-align:center;margin:0 2px">${digit}</span>`,
    )
    .join('');
  return `
    <div style="text-align:center;margin:24px 0 8px;white-space:nowrap">${cells}</div>
    <p style="margin:8px 0 0;text-align:center;font-size:12px;color:${COLOR_TEXT_MUTED}">${hint}</p>
  `;
}

export function verificationEmailBody(code: string): string {
  return `
      <h1 class="lg-h1" style="margin:0 0 8px;font-size:22px;color:${COLOR_TEXT};font-weight:700">Bienvenue sur ${env.appName} !</h1>
      <p style="margin:0 0 16px;font-size:15px;color:${COLOR_TEXT_SECONDARY};line-height:1.6">Vous venez de créer un compte sur ${env.appName}. Saisissez le code ci-dessous pour l'activer&nbsp;:</p>
      ${codeBox(COLOR_PRIMARY, code, `Ce code est valable pendant ${Math.round(VERIFICATION_CODE_TTL_MINUTES)} minutes.`)}
    `;
}

export function resetPasswordEmailBody(code: string): string {
  return `
      <h1 class="lg-h1" style="margin:0 0 8px;font-size:22px;color:${COLOR_TEXT};font-weight:700">Réinitialisation du mot de passe</h1>
      <p style="margin:0 0 16px;font-size:15px;color:${COLOR_TEXT_SECONDARY};line-height:1.6">Vous avez demandé à réinitialiser votre mot de passe sur ${env.appName}. Saisissez le code ci-dessous&nbsp;:</p>
      ${codeBox(COLOR_PRIMARY, code, `Ce code est valable pendant ${Math.round(RESET_CODE_TTL_MINUTES)} minutes.`)}
      <p style="margin:12px 0 0;font-size:13px;color:${COLOR_TEXT_MUTED};line-height:1.6">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
    `;
}

export async function sendVerificationEmail(to: string, code: string): Promise<boolean> {
  return send({
    to,
    subject: `Votre code de vérification — ${env.appName}`,
    preheader: `Votre code de vérification : ${code}`,
    bodyHtml: verificationEmailBody(code),
    bodyText: `Bienvenue sur ${env.appName} ! Votre code de vérification est : ${code}. Il expire dans ${Math.round(VERIFICATION_CODE_TTL_MINUTES)} minutes.`,
  });
}

export async function sendResetPasswordEmail(to: string, code: string): Promise<boolean> {
  return send({
    to,
    subject: `Votre code de réinitialisation — ${env.appName}`,
    preheader: `Votre code de réinitialisation : ${code}`,
    bodyHtml: resetPasswordEmailBody(code),
    bodyText: `Réinitialisation de mot de passe ${env.appName} : votre code est ${code}. Il expire dans ${Math.round(RESET_CODE_TTL_MINUTES)} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
  });
}
