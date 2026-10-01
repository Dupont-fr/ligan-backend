import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { checkout, downgrade, mySubscription, paymentStatus } from './controller.js';
import { checkoutSchema, paymentIdParamSchema } from './validator.js';

const router = Router();

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de tentatives de paiement, réessayez dans 15 minutes' },
});

const pollLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de vérifications, réessayez plus tard' },
});

router.use(requireAuth, requireRole('PROFESSIONAL'));

router.get('/me', mySubscription);
router.post('/checkout', checkoutLimiter, validate(checkoutSchema), checkout);
router.get('/payments/:id', pollLimiter, validate(paymentIdParamSchema, 'params'), paymentStatus);
router.post('/downgrade', downgrade);

export default router;
