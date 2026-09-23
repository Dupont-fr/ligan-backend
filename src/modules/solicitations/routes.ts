import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  createSolicitation,
  listMySolicitations,
  updateSolicitation,
} from './controller.js';
import {
  createSolicitationSchema,
  solicitationIdParamSchema,
  updateSolicitationSchema,
} from './validator.js';

const router = Router();

router.post('/', requireAuth, validate(createSolicitationSchema), createSolicitation);
router.get('/', requireAuth, listMySolicitations);
router.patch(
  '/:id',
  requireAuth,
  validate(solicitationIdParamSchema, 'params'),
  validate(updateSolicitationSchema),
  updateSolicitation,
);

export default router;
