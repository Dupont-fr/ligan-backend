import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { failure } from '../../utils/ApiResponse.js';
import {
  forgotPassword,
  login,
  logout,
  me,
  refresh,
  register,
  resendCode,
  resetPassword,
  verifyCode,
  verifyResetCode,
} from './controller.js';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendCodeSchema,
  resetPasswordSchema,
  verifyCodeSchema,
  verifyResetCodeSchema,
} from './validator.js';

const router = Router();

const tooManyHandler = (_req: Request, res: Response) =>
  failure(res, 'Trop de requêtes, réessaie dans quelques minutes', 429);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyHandler,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyHandler,
});

const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyHandler,
});

const codeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyHandler,
});

router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/verify-code', codeLimiter, validate(verifyCodeSchema), verifyCode);
router.post('/resend-code', codeLimiter, validate(resendCodeSchema), resendCode);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.post('/forgot-password', passwordLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/verify-reset-code', codeLimiter, validate(verifyResetCodeSchema), verifyResetCode);
router.post('/reset-password', passwordLimiter, validate(resetPasswordSchema), resetPassword);

export default router;