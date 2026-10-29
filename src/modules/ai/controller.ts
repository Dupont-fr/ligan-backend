import type { Request, Response } from 'express';
import { AppError } from '../../middlewares/errorHandler.js';
import { Activity } from '../../models/Activity.js';
import { User } from '../../models/User.js';
import { Subscription } from '../../models/Subscription.js';
import { generateActivityFromPrompt } from '../../services/ai/gemini.js';
import { resolvePlan } from '../../services/payments/index.js';
import { success } from '../../utils/ApiResponse.js';
import type { GenerateActivityInput } from './validator.js';

export async function generateActivityDraft(req: Request, res: Response) {
  const user = await User.findById(req.user?.id).select('role');
  if (!user || user.role !== 'PROFESSIONAL') {
    throw new AppError('Réservé aux professionnels', 403);
  }

  const { code } = await resolvePlan(String(user._id));
  if (code === 'FREE') {
    const aiCount = await Activity.countDocuments({ professionalId: user._id, createdViaAi: true });
    if (aiCount >= 2) {
      throw new AppError(
        "Vous avez déjà utilisé vos 2 créations gratuites avec l'IA. Passez en Pro ou Premium pour continuer.",
        403,
      );
    }
    if (aiCount === 1) {
      // Laisser passer mais on signale côté logique ; le frontend alerte déjà
    }
  } else if (code !== 'PRO' && code !== 'PREMIUM') {
    throw new AppError("Générateur IA disponible uniquement avec un abonnement Pro ou Premium.", 403);
  } else {
    const sub = await Subscription.findOne({ userId: user._id, status: 'ACTIVE' })
      .populate('planId')
      .sort({ createdAt: -1 });
    const plan = (sub?.planId as any)?.code;
    if (plan !== 'PRO' && plan !== 'PREMIUM') {
      throw new AppError("Générateur IA disponible uniquement avec un abonnement Pro ou Premium.", 403);
    }
  }

  const input = req.validBody as GenerateActivityInput;
  try {
    const draft = await generateActivityFromPrompt(input.prompt);
    if (code === 'FREE') {
      const aiCount = await Activity.countDocuments({ professionalId: user._id, createdViaAi: true });
      const remaining = Math.max(0, 2 - aiCount);
      return success(res, {
        draft,
        freeAiLimit: { used: aiCount, max: 2, remaining },
        warning: remaining === 1 ? "Il ne vous reste plus qu'1 activité gratuite avec l'IA." : undefined,
      });
    }
    return success(res, { draft });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur lors de la génération IA';
    throw new AppError(msg, 502);
  }
}
