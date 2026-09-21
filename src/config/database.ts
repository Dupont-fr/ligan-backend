import mongoose from 'mongoose';
import env from './env.js';
import { logger } from '../utils/logger.js';

const DB_STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export interface DbState {
  connected: boolean;
  state: string;
}

export async function connectDatabase(): Promise<void> {
  if (!env.mongoUri) {
    logger.warn('MONGODB_URI absent : démarrage sans base de données.');
    return;
  }

  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connecté.');
  });
  mongoose.connection.on('error', (err) => {
    logger.error(`Erreur MongoDB : ${err.message}`);
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB déconnecté.');
  });

  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10_000 });
}

export function getDbState(): DbState {
  const state = DB_STATES[mongoose.connection.readyState] ?? 'unknown';
  return { connected: mongoose.connection.readyState === 1, state };
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}