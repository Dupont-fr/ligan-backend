import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { failure } from '../../utils/ApiResponse.js';
import { myStats, platformOverview, trackEvent } from './controller.js';
import { statsQuerySchema, trackEventSchema } from './validator.js';

const router = Router();

// Tracking public : volume borné par IP (le dédupage visiteur est côté client).
const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => failure(res, 'Trop de requêtes, réessaie dans quelques minutes', 429),
});

router.post('/events', analyticsLimiter, validate(trackEventSchema), trackEvent);
router.get('/stats', requireAuth, requireRole('PROFESSIONAL'), validate(statsQuerySchema, 'query'), myStats);
router.get('/overview', requireAuth, requireRole('ADMIN'), validate(statsQuerySchema, 'query'), platformOverview);

export default router;
