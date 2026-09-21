import { Router } from 'express';
import { healthCheck } from './controller.js';

const router = Router();

router.get('/health', healthCheck);

export default router;