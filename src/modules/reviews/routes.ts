import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { createReview, deleteReview } from './controller.js';
import { createReviewSchema, idParamSchema } from './validator.js';

const router = Router();

router.post(
  '/',
  requireAuth,
  requireRole('CUSTOMER', 'PROFESSIONAL'),
  validate(createReviewSchema),
  createReview,
);
router.delete('/:id', requireAuth, validate(idParamSchema, 'params'), deleteReview);

export default router;
