import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { getBusiness } from './controller.js';
import { businessSlugSchema } from './validator.js';

const router = Router();

router.get('/:slug', validate(businessSlugSchema, 'params'), getBusiness);

export default router;
