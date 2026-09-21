import 'dotenv/config';

function required(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

const nodeEnv = required('NODE_ENV', 'development');

const env = {
  appName: required('APP_NAME', 'Ligan+'),
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 5000),
  mongoUri: required('MONGODB_URI', ''),
  frontendUrl: required('FRONTEND_URL', 'http://localhost:5173'),
  jwtSecret: required('JWT_SECRET', 'change-me-in-production'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'change-me-in-production'),
  accessTokenTtl: required('ACCESS_TOKEN_TTL', '15m'),
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS ?? 30),
  email: {
    host: required('EMAIL_HOST', 'smtp-relay.brevo.com'),
    port: Number(process.env.EMAIL_PORT ?? 587),
    user: required('EMAIL_USER', ''),
    pass: required('EMAIL_PASS', ''),
    fromName: required('EMAIL_FROM_NAME', 'Ligan+'),
    from: required('EMAIL_FROM', ''),
    disabled: process.env.EMAIL_DISABLED === '1',
  },
};

export default env;