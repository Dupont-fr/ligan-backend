import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import env from './config/env.js';
import type { Request } from 'express';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import healthRoutes from './modules/health/routes.js';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.isProduction ? env.frontendUrl : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (!env.isProduction) {
  app.use(morgan('tiny'));
}

app.get('/', (_req: Request, res) => {
  res.json({ success: true, data: { message: `${env.appName} API — voir /api/health` } });
});

app.use('/api', healthRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;