import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  adminStats,
  createUser,
  deleteUser,
  listAdminActivities,
  listAdminReviews,
  listUsers,
  setActivityStatus,
  setReviewStatus,
  suspendUser,
  updateUser,
} from './controller.js';
import {
  createUserSchema,
  idParamSchema,
  listActivitiesSchema,
  listReviewsSchema,
  setActivityStatusSchema,
  setReviewStatusSchema,
  suspendUserSchema,
  updateUserSchema,
} from './validator.js';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/stats', adminStats);
router.get('/users', listUsers);
router.post('/users', validate(createUserSchema), createUser);
router.patch('/users/:id', validate(idParamSchema, 'params'), validate(updateUserSchema), updateUser);
router.patch('/users/:id/suspend', validate(idParamSchema, 'params'), validate(suspendUserSchema), suspendUser);
router.delete('/users/:id', validate(idParamSchema, 'params'), deleteUser);

router.get('/activities', validate(listActivitiesSchema, 'query'), listAdminActivities);
router.patch('/activities/:id/status', validate(idParamSchema, 'params'), validate(setActivityStatusSchema), setActivityStatus);

router.get('/reviews', validate(listReviewsSchema, 'query'), listAdminReviews);
router.patch('/reviews/:id/status', validate(idParamSchema, 'params'), validate(setReviewStatusSchema), setReviewStatus);

export default router;
