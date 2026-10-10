import 'dotenv/config';

function required(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

const nodeEnv = required('NODE_ENV', 'development');

const env = {
  appName: required('APP_NAME', 'LIGAN+'),
  nodeEnv,
  isProduction: nodeEnv === 'production',
  // `Number('')` vaut 0 (truthy) : une variable PORT vide ferait écouter le
  // serveur sur le port 0 au lieu du fallback. On retombe sur 5000 si absente
  // ou invalide ; Render écrase ensuite avec son propre PORT.
  port: Number(process.env.PORT) || 5000,
  mongoUri: required('MONGODB_URI', ''),
  frontendUrl: required('FRONTEND_URL', 'http://localhost:5173'),
  jwtSecret: required('JWT_SECRET', 'change-me-in-production'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'change-me-in-production'),
  accessTokenTtl: required('ACCESS_TOKEN_TTL', '15m'),
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS ?? 30),
  email: {
    apiKey: required('BREVO_API_KEY', ''),
    host: required('EMAIL_HOST', 'smtp-relay.brevo.com'),
    // Même piège que PORT : `Number('')` vaut 0 et ouvrirait un SMTP sur un
    // port invalide. On retombe toujours sur 587 si la variable est vide.
    port: Number(process.env.EMAIL_PORT) || 587,
    user: required('EMAIL_USER', ''),
    pass: required('EMAIL_PASS', ''),
    fromName: required('EMAIL_FROM_NAME', 'LIGAN+'),
    from: required('EMAIL_FROM', ''),
    disabled: process.env.EMAIL_DISABLED === '1',
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
    /** URL publique du backend — sert à construire le callback_url des collectes. */
    publicApiUrl: (process.env.PUBLIC_API_URL ?? '').replace(/\/+$/, ''),
  },
};

export default env;