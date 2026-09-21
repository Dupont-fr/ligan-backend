import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import env from './config/env.js';

async function start() {
  try {
    await connectDatabase();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'erreur inconnue';
    console.error(`[server] Connexion MongoDB impossible : ${message}`);
  }

  const server = app.listen(env.port, () => {
    console.log(`[server] ${env.appName} API démarrée sur http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = async () => {
    console.log('\n[server] Arrêt en cours…');
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();