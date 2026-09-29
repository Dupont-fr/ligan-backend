import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { getBusiness, searchBusinesses } from './controller.js';
import { businessSearchSchema, businessSlugSchema } from './validator.js';

const router = Router();

// /search avant /:slug — sinon « search » serait interprété comme un slug.
router.get('/search', validate(businessSearchSchema, 'query'), searchBusinesses);
router.get('/:slug', validate(businessSlugSchema, 'params'), getBusiness);

export default router;
