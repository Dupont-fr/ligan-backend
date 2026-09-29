import { Router } from 'express';
import { optionalAuth, requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { createCategory, deleteCategory, listCategories, updateCategory } from './controller.js';
import { createCategorySchema, idParamSchema, listCategoriesSchema, updateCategorySchema } from './validator.js';

const router = Router();

router.get('/', validate(listCategoriesSchema, 'query'), optionalAuth, listCategories);
router.post('/', requireAuth, requireRole('ADMIN'), validate(createCategorySchema), createCategory);
router.patch('/:id', requireAuth, requireRole('ADMIN'), validate(idParamSchema, 'params'), validate(updateCategorySchema), updateCategory);
router.delete('/:id', requireAuth, requireRole('ADMIN'), validate(idParamSchema, 'params'), deleteCategory);

export default router;
