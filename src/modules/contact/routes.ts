import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { sendContactMessage } from './controller.js';
import { contactSchema } from './validator.js';

const router = Router();

router.post('/', validate(contactSchema), sendContactMessage);

export default router;
