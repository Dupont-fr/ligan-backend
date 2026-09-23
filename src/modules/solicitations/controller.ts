import type { Request, Response } from 'express';
import { AppError } from '../../middlewares/errorHandler.js';
import { User } from '../../models/User.js';
import { Solicitation, toPublicSolicitation } from '../../models/Solicitation.js';
import { success } from '../../utils/ApiResponse.js';
import type { CreateSolicitationInput, UpdateSolicitationInput } from './validator.js';

export async function createSolicitation(req: Request, res: Response) {
  const fromId = req.user?.id;
  if (!fromId) {
    throw new AppError('Authentification requise', 401);
  }

  const { toProfessionalId, activityId, message } = req.validBody as CreateSolicitationInput;

  if (toProfessionalId === fromId) {
    throw new AppError('Vous ne pouvez pas vous solliciter vous-même', 400);
  }

  const target = await User.findById(toProfessionalId);
  if (!target) {
    throw new AppError('Professionnel introuvable', 404);
  }
  if (target.role !== 'PROFESSIONAL') {
    throw new AppError("Cette personne n'est pas un professionnel", 400);
  }

  const solicitation = await Solicitation.create({
    fromId,
    toId: toProfessionalId,
    ...(activityId ? { activityId } : {}),
    message,
  });

  await solicitation.populate([
    { path: 'fromId', select: 'firstName lastName' },
    { path: 'toId', select: 'firstName lastName' },
  ]);

  return success(res, { solicitation: toPublicSolicitation(solicitation) }, 201);
}

export async function listMySolicitations(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentification requise', 401);
  }

  const [received, sent] = await Promise.all([
    Solicitation.find({ toId: userId })
      .sort({ createdAt: -1 })
      .populate('fromId', 'firstName lastName')
      .populate('toId', 'firstName lastName'),
    Solicitation.find({ fromId: userId })
      .sort({ createdAt: -1 })
      .populate('fromId', 'firstName lastName')
      .populate('toId', 'firstName lastName'),
  ]);

  return success(res, {
    received: received.map(toPublicSolicitation),
    sent: sent.map(toPublicSolicitation),
  });
}

export async function updateSolicitation(req: Request, res: Response) {
  const userId = req.user?.id;
  const { id } = req.validParams as { id: string };
  const { status } = req.validBody as UpdateSolicitationInput;

  const solicitation = await Solicitation.findById(id);
  if (!solicitation) {
    throw new AppError('Sollicitation introuvable', 404);
  }
  if (solicitation.toId.toString() !== userId) {
    throw new AppError('Seul le destinataire peut répondre à cette sollicitation', 403);
  }
  if (solicitation.status !== 'PENDING') {
    throw new AppError('Cette sollicitation a déjà été traitée', 400);
  }

  solicitation.status = status;
  await solicitation.save();
  await solicitation.populate([
    { path: 'fromId', select: 'firstName lastName' },
    { path: 'toId', select: 'firstName lastName' },
  ]);

  return success(res, { solicitation: toPublicSolicitation(solicitation) });
}
