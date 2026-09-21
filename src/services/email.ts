import nodemailer from 'nodemailer';
import env from '../config/env.js';

interface MailInput {
  to: string;
  subject: string;
  preheader: string;
  bodyHtml: string;
  bodyText: string;
}

const EMAIL_MAX_WIDTH = '600px';
const BRAND_COLOR = '#4f46e5';

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
                      <div style="font-size:18px;font-weight:700;color:#0f172a;margin-top:8px">Ligan<span style="color:${BRAND_COLOR}">+</span></div>
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

function button(ctaText: string, ctaUrl: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0">
  <tr>
    <td align="center">
      <a href="${ctaUrl}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:${BRAND_COLOR};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px">${ctaText}</a>
    </td>
  </tr>
</table>`;
}

async function send(input: MailInput): Promise<boolean> {
  const { user, pass } = env.email;

  if (env.email.disabled || !user || !pass) {
    console.log(`\n[email] (DEV — aucun SMTP configuré) ${input.subject}\n      → ${input.to}\n      ${input.bodyText}\n`);
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: env.email.host,
    port: env.email.port,
    secure: env.email.port === 465,
    auth: { user, pass },
  });

  const from =
    env.email.from && env.email.from.includes('@')
      ? `"${env.email.fromName}" <${env.email.from}>`
      : `"${env.email.fromName}" <${user}>`;

  const { html, text } = frame(input);

  try {
    await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html,
      text,
    });
    console.log(`[email] envoyé à ${input.to} : ${input.subject}`);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'erreur inconnue';
    console.warn(`[email] échec d'envoi vers ${input.to} : ${message}`);
    return false;
  }
}

export async function sendVerificationEmail(to: string, url: string): Promise<boolean> {
  return send({
    to,
    subject: `Vérifie ton adresse email — ${env.appName}`,
    preheader: 'Confirme ta création de compte pour activer ton accès.',
    bodyHtml: `
      <h1 style="margin:0 0 8px;font-size:22px;color:#0f172a;font-weight:700">Bienvenue sur ${env.appName} !</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.6">${env.appName} vous connecte aux professionnels locaux, près de chez vous. Pour activer votre compte, cliquez sur le bouton ci-dessous&nbsp;:</p>
      ${button('Vérifier mon adresse email', url)}
      <p style="margin:0 0 8px;font-size:13px;color:#64748b">Ce lien est valable pendant <strong>24 heures</strong>.</p>
      <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6">Si le bouton ne fonctionne pas, copiez&nbsp;:</p>
      <p style="margin:0;font-size:12px;color:${BRAND_COLOR};word-break:break-all"><a href="${url}" target="_blank" style="color:${BRAND_COLOR}">${url}</a></p>
    `,
    bodyText: `Bienvenue sur ${env.appName} ! Pour activer votre compte, ouvrez ce lien : ${url}. Ce lien est valable 24 heures.`,
  });
}

export async function sendResetPasswordEmail(to: string, url: string): Promise<boolean> {
  return send({
    to,
    subject: `Réinitialisation de mot de passe — ${env.appName}`,
    preheader: 'Un lien pour choisir un nouveau mot de passe.',
    bodyHtml: `
      <h1 style="margin:0 0 8px;font-size:22px;color:#0f172a;font-weight:700">Réinitialisation du mot de passe</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.6">Vous avez demandé à changer votre mot de passe ${env.appName}. Cliquez sur le bouton ci-dessous pour le définir&nbsp;:</p>
      ${button('Choisir un nouveau mot de passe', url)}
      <p style="margin:0 0 8px;font-size:13px;color:#64748b">Ce lien est valable pendant <strong>1 heure</strong>.</p>
      <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
      <p style="margin:12px 0 0;font-size:13px;color:#94a3b8;line-height:1.6">Si le bouton ne fonctionne pas, copiez&nbsp;:</p>
      <p style="margin:0;font-size:12px;color:${BRAND_COLOR};word-break:break-all"><a href="${url}" target="_blank" style="color:${BRAND_COLOR}">${url}</a></p>
    `,
    bodyText: `Réinitialisation de mot de passe ${env.appName} : ouvrez ce lien (valable 1 heure) : ${url}. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
  });
}