import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { adminStats, createUser, deleteUser, listUsers, updateUser } from './controller.js';
import { createUserSchema, idParamSchema, updateUserSchema } from './validator.js';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/stats', adminStats);
router.get('/users', listUsers);
router.post('/users', validate(createUserSchema), createUser);
router.patch('/users/:id', validate(idParamSchema, 'params'), validate(updateUserSchema), updateUser);
router.delete('/users/:id', validate(idParamSchema, 'params'), deleteUser);

export default router;
