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

/**
 * Limite par numéro débité : les opérateurs mobile money appliquent des règles
 * anti-fraude aux pushes répétés sur un même numéro. Enchaîner les collectes
 * peut faire basculer le numéro (ou le compte marchand) en refus systématique,
 * sans jamais aboutir. On espace donc les tentatives par numéro.
 */
const checkoutPhoneLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const raw = (req.body as { phoneNumber?: unknown } | undefined)?.phoneNumber;
    const digits = typeof raw === 'string' ? raw.replace(/\D/g, '').slice(-9) : '';
    return digits.length === 9 ? `phone:${digits}` : 'phone:inconnu';
  },
  message: {
    success: false,
    message:
      'Trop de tentatives pour ce numéro mobile money. Patientez quelques minutes avant de relancer un paiement.',
  },
});

const pollLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de vérifications, réessayez plus tard' },
});

router.use(requireAuth, requireRole('PROFESSIONAL'));

router.get('/me', mySubscription);
router.post('/checkout', checkoutLimiter, checkoutPhoneLimiter, validate(checkoutSchema), checkout);
router.get('/payments/:id', pollLimiter, validate(paymentIdParamSchema, 'params'), paymentStatus);
router.post('/downgrade', downgrade);

export default router;
