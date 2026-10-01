import { Router } from 'express';
import { listPlans } from './controller.js';

const router = Router();

router.get('/', listPlans);

export default router;
