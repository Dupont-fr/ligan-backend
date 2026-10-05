import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { sebpayWebhook } from './controller.js';

const router = Router();

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de requêtes' },
});

router.post('/webhook', webhookLimiter, sebpayWebhook);

export default router;
