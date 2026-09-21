import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import env from './config/env.js';
import { logger } from './utils/logger.js';

async function start() {
  logger.info(`Démarrage de ${env.appName} API (environnement : ${env.nodeEnv})`);

  if (env.email.disabled || !env.email.user || !env.email.pass) {
    logger.info(
      'Brevo / SMTP non configuré ou EMAIL_DISABLED=1 : mode DEV, emails logés en console.',
    );
  } else {
    logger.info(
      `Brevo API prête (SMTP ${env.email.host}:${env.email.port}, expéditeur "${env.email.fromName}" <${env.email.from || env.email.user}>)`,
    );
  }

  try {
    await connectDatabase();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'erreur inconnue';
    logger.error(`Connexion MongoDB impossible : ${message}`);
  }

  const server = app.listen(env.port, () => {
    logger.info(`API démarrée sur http://localhost:${env.port}`);
  });

  const shutdown = async () => {
    logger.info('Arrêt en cours…');
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();