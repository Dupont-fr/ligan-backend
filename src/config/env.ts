import 'dotenv/config';

function required(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

const nodeEnv = required('NODE_ENV', 'development');

const emailPort = Number(process.env.EMAIL_PORT ?? process.env.SMTP_PORT);
const emailSecure =
  process.env.EMAIL_SECURE !== undefined
    ? process.env.EMAIL_SECURE === 'true' || process.env.EMAIL_SECURE === '1'
    : Number.isFinite(emailPort) && emailPort === 465;

const env = {
  appName: required('APP_NAME', 'LIGAN+'),
  nodeEnv,
  isProduction: nodeEnv === 'production',
  // `Number('')` vaut 0 (truthy) : une variable PORT vide ferait Accouter le
  // serveur sur le port 0 au lieu du fallback. On retombe sur 5000 si absente
  // ou invalide ; Render Accrase ensuite avec son propre PORT.
  port: Number(process.env.PORT) || 5000,
  mongoUri: required('MONGODB_URI', ''),
  // NormalisAc sans `/` final : la comparaison des origines CORS est stricte
  // (https://x.fr/ �%� https://x.fr) et ferait Acchouer le preflight en prod.
  frontendUrl: required('FRONTEND_URL', 'http://localhost:5173').replace(/\/+$/, ''),
  jwtSecret: required('JWT_SECRET', 'change-me-in-production'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'change-me-in-production'),
  accessTokenTtl: required('ACCESS_TOKEN_TTL', '15m'),
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS ?? 30),
  email: {
    apiKey: required('BREVO_API_KEY', ''),
    host: required('EMAIL_HOST', 'smtp-relay.brevo.com'),
    // MA�me piA"ge que PORT : `Number('')` vaut 0 et ouvrirait un SMTP sur un
    // port invalide. On retombe toujours sur 587 si la variable est vide.
    port: Number.isFinite(emailPort) ? emailPort : 587,
    user: required('EMAIL_USER', ''),
    pass: required('EMAIL_PASS', ''),
    fromName: required('EMAIL_FROM_NAME', 'LIGAN+'),
    from: required('EMAIL_FROM', ''),
    disabled: process.env.EMAIL_DISABLED === '1',
  },
  smtp: {
    host: process.env.SMTP_HOST || process.env.EMAIL_HOST || undefined,
    port: Number.isFinite(emailPort) ? emailPort : 587,
    secure: emailSecure,
    user: process.env.SMTP_USER || process.env.EMAIL_USER || undefined,
    pass: process.env.SMTP_PASS || process.env.EMAIL_PASS || undefined,
    from: process.env.SMTP_FROM || process.env.EMAIL_FROM || undefined,
  },
  admin: {
    email: required('ADMIN_EMAIL', ''),
    password: required('ADMIN_PASSWORD', ''),
    bootstrapToken: required('BOOTSTRAP_TOKEN', ''),
  },
  payment: {
    sebpayPublicKey: required('SEBPAY_PUBLIC_KEY', ''),
    sebpaySecretKey: required('SEBPAY_SECRET_KEY', ''),
    sebpayCurrency: required('SEBPAY_CURRENCY', 'XAF'),
    sebpayCountry: required('SEBPAY_COUNTRY', 'CM').toUpperCase(),
    /**
     * Indicatif pays ajoutAc aux numAcros locaux (9 chiffres) avant l'envoi A�
     * SebPay, qui attendu un format international sans A� + A� (ex. A� 237�?� A�).
     */
    phoneCountryCode: required('PHONE_COUNTRY_CODE', '237').replace(/\D/g, ''),
    /** URL publique du backend �?" sert A� construire the callback_url des collectes. */
    publicApiUrl: (process.env.PUBLIC_API_URL ?? '').replace(/\/+$/, ''),
  },
};

export default env;