import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import sanitize from 'mongo-sanitize';
import morgan from 'morgan';
import path from 'node:path';
import env from './config/env.js';
import type { NextFunction, Request } from 'express';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import activitiesRoutes from './modules/activities/routes.js';
import adminRoutes from './modules/admin/routes.js';
import analyticsRoutes from './modules/analytics/routes.js';
import authRoutes from './modules/auth/routes.js';
import businessesRoutes from './modules/businesses/routes.js';
import categoriesRoutes from './modules/categories/routes.js';
import healthRoutes from './modules/health/routes.js';
import paymentsRoutes from './modules/payments/routes.js';
import plansRoutes from './modules/plans/routes.js';
import reviewsRoutes from './modules/reviews/routes.js';
import solicitationsRoutes from './modules/solicitations/routes.js';
import subscriptionsRoutes from './modules/subscriptions/routes.js';

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: env.isProduction ? env.frontendUrl : true,
    credentials: true,
  }),
);
// Photos envoyées en URL (Cloudinary) : 10mb suffisent.
// `verify` conserve le corps brut pour la signature du webhook FeexPay.
app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
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

// Photos d'activités (Sprint 3)
app.use(
  '/uploads',
  express.static(path.resolve(process.cwd(), 'uploads'), {
    fallthrough: true,
    maxAge: env.isProduction ? '7d' : 0,
    index: false,
  }),
);

app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/businesses', businessesRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/solicitations', solicitationsRoutes);
// Plans publics + abonnements pro + webhook paiements (Sprint 12)
app.use('/api/plans', plansRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/payments', paymentsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;