import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  createActivity,
  deleteActivity,
  listActivities,
  listMyActivities,
  updateActivity,
} from './controller.js';
import { createActivitySchema, idParamSchema, listActivitiesSchema, updateActivitySchema } from './validator.js';

const router = Router();

router.get('/', validate(listActivitiesSchema, 'query'), listActivities);
router.get('/mine', requireAuth, requireRole('PROFESSIONAL'), listMyActivities);
router.post('/', requireAuth, requireRole('PROFESSIONAL'), validate(createActivitySchema), createActivity);
router.patch(
  '/:id',
  requireAuth,
  requireRole('PROFESSIONAL'),
  validate(idParamSchema, 'params'),
  validate(updateActivitySchema),
  updateActivity,
);
router.delete('/:id', requireAuth, requireRole('PROFESSIONAL'), validate(idParamSchema, 'params'), deleteActivity);

export default router;
