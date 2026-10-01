import type { Request, Response } from 'express';
import { AppError } from '../../middlewares/errorHandler.js';
import { Activity } from '../../models/Activity.js';
import { Review, toPublicReview } from '../../models/Review.js';
import { success } from '../../utils/ApiResponse.js';
import type { CreateReviewInput } from './validator.js';

/** Publier un avis (Sprint 11) — statut PENDING, visible après modération. */
export async function createReview(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentification requise', 401);
  }
  const input = req.validBody as CreateReviewInput;

  const activity = await Activity.findById(input.activityId).select('professionalId status title');
  if (!activity || activity.status !== 'APPROVED') {
    throw new AppError('Activité introuvable', 404);
  }
  if (String(activity.professionalId) === userId) {
    throw new AppError('Tu ne peux pas publier un avis sur ta propre activité', 422);
  }

  const existing = await Review.findOne({ reviewerId: userId, activityId: input.activityId });
  if (existing) {
    throw new AppError('Tu as déjà publié un avis sur cette activité', 409);
  }

  try {
    const review = await Review.create({
      reviewerId: userId,
      activityId: input.activityId,
      rating: input.rating,
      comment: input.comment,
    });
    await review.populate('reviewerId', 'firstName lastName');
    return success(res, { review: toPublicReview(review, { withStatus: true }) }, 201);
  } catch (err) {
    // Unique index { reviewerId, activityId } : requête simultanée.
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: number }).code === 11000) {
      throw new AppError('Tu as déjà publié un avis sur cette activité', 409);
    }
    throw err;
  }
}

/** Supprimer son propre avis (l'auteur uniquement) — les admin modèrent via le statut. */
export async function deleteReview(req: Request, res: Response) {
  const { id } = req.validParams as { id: string };

  const review = await Review.findById(id);
  if (!review) {
    throw new AppError('Avis introuvable', 404);
  }
  if (String(review.reviewerId) !== req.user?.id) {
    throw new AppError('Tu ne peux supprimer que tes propres avis', 403);
  }

  await review.deleteOne();
  return success(res, { message: 'Avis supprimé' });
}
