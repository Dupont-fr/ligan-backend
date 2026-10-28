import type { Request, Response } from 'express';
import { AppError } from '../../middlewares/errorHandler.js';
import { User } from '../../models/User.js';
import { Subscription } from '../../models/Subscription.js';
import { generateActivityFromPrompt } from '../../services/ai/gemini.js';
import { success } from '../../utils/ApiResponse.js';
import type { GenerateActivityInput } from './validator.js';

export async function generateActivityDraft(req: Request, res: Response) {
  const user = await User.findById(req.user?.id).select('role');
  if (!user || user.role !== 'PROFESSIONAL') {
    throw new AppError('Réservé aux professionnels', 403);
  }

  const sub = await Subscription.findOne({ userId: user._id, status: 'ACTIVE' })
    .populate('planId')
    .sort({ createdAt: -1 });

  const plan = (sub?.planId as any)?.code;
  if (plan !== 'PRO' && plan !== 'PREMIUM') {
    throw new AppError("Générateur IA disponible uniquement avec un abonnement Pro ou Premium.", 403);
  }

  const input = req.validBody as GenerateActivityInput;
  try {
    const draft = await generateActivityFromPrompt(input.prompt);
    return success(res, { draft });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur lors de la génération IA';
    throw new AppError(msg, 502);
  }
}
