import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { createUser, listUsers } from './controller.js';
import { createUserSchema } from './validator.js';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/users', listUsers);
router.post('/users', validate(createUserSchema), createUser);

export default router;
