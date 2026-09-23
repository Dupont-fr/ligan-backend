import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import sanitize from 'mongo-sanitize';
import morgan from 'morgan';
import env from './config/env.js';
import type { NextFunction, Request } from 'express';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import activitiesRoutes from './modules/activities/routes.js';
import authRoutes from './modules/auth/routes.js';
import healthRoutes from './modules/health/routes.js';
import solicitationsRoutes from './modules/solicitations/routes.js';

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: env.isProduction ? env.frontendUrl : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use((req: Request, _res, next: NextFunction) => {
  req.body = sanitize(req.body);
  next();
});

if (!env.isProduction) {
  app.use(morgan('tiny'));
}

app.get('/', (_req: Request, res) => {
  res.json({ success: true, data: { message: `${env.appName} API — voir /api/health` } });
});

app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/solicitations', solicitationsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;