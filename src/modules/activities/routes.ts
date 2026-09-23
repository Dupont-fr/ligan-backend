import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { createActivity, deleteActivity, listActivities, listMyActivities } from './controller.js';
import { createActivitySchema, idParamSchema, listActivitiesSchema } from './validator.js';

const router = Router();

router.get('/', validate(listActivitiesSchema, 'query'), listActivities);
router.get('/mine', requireAuth, requireRole('PROFESSIONAL'), listMyActivities);
router.post('/', requireAuth, requireRole('PROFESSIONAL'), validate(createActivitySchema), createActivity);
router.delete('/:id', requireAuth, requireRole('PROFESSIONAL'), validate(idParamSchema, 'params'), deleteActivity);

export default router;
