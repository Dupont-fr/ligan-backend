import { Router } from 'express';
import { optionalAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { getBusiness, searchBusinesses } from './controller.js';
import { businessSearchSchema, businessSlugSchema } from './validator.js';

const router = Router();

// /search avant /:slug — sinon « search » serait interprété comme un slug.
router.get('/search', validate(businessSearchSchema, 'query'), searchBusinesses);
// optionalAuth : le propriétaire/admin peut prévisualiser une fiche non validée.
router.get('/:slug', optionalAuth, validate(businessSlugSchema, 'params'), getBusiness);

export default router;
