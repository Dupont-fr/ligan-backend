import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { generateActivityDraft } from './controller.js';
import { generateActivitySchema } from './validator.js';

const router = Router();

router.post(
  '/generate-activity',
  requireAuth,
  requireRole('PROFESSIONAL'),
  validate(generateActivitySchema),
  generateActivityDraft,
);

export default router;
