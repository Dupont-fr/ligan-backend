import 'dotenv/config';

function required(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

const env = {
  appName: required('APP_NAME', 'Ligan+'),
  nodeEnv: required('NODE_ENV', 'development'),
  port: Number(process.env.PORT ?? 5000),
  mongoUri: required('MONGODB_URI', ''),
  frontendUrl: required('FRONTEND_URL', 'http://localhost:5173'),
  isProduction: (required('NODE_ENV', 'development') ?? 'development') === 'production',
};

export default env;