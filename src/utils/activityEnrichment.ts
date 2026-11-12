import type { PipelineStage } from 'mongoose';
import type { ActivityDocument } from '../models/Activity.js';

/** Ligne d'activité enrichie (plan effectif + vérification) issue d'une agrégation. */
export type SearchRow = ActivityDocument & {
  _id: unknown;
  distance?: number;
  isVerified?: boolean;
  planCode?: string;
  rank?: number;
};

/** Tri/match insensibles à la casse et aux accents. */
export const COLLATION = { locale: 'fr', strength: 2 } as const;

/**
 * Enrichissement Sprint 14 « Premium et visibilité » : owner vérifié
 * (filtre `verified` optionnel) + plan effectif de l'abonnement
 * (FREE/PRO/PREMIUM) calculé à la volée + `rank` pour le boost.
 *
 * Partagé entre la recherche (`businesses`) et le fil d'activité (`activities`).
 */
export function enrichStages(now: Date, verified?: boolean): PipelineStage[] {
  return [
    { $lookup: { from: 'users', localField: 'professionalId', foreignField: '_id', as: 'proOwner' } },
    ...(verified !== undefined
      ? [{ $match: { 'proOwner.isVerified': verified } } as PipelineStage.Match]
      : []),
    {
      $lookup: {
        from: 'subscriptions',
        let: { proId: '$professionalId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$userId', '$$proId'] },
                  { $eq: ['$status', 'ACTIVE'] },
                  { $or: [{ $eq: ['$endDate', null] }, { $gt: ['$endDate', now] }] },
                ],
              },
            },
          },
          { $lookup: { from: 'plans', localField: 'planId', foreignField: '_id', as: 'planDoc' } },
          { $unwind: { path: '$planDoc', preserveNullAndEmptyArrays: true } },
          { $project: { _id: 0, code: '$planDoc.code' } },
        ],
        as: 'subPlan',
      },
    },
    {
      $addFields: {
        isVerified: { $arrayElemAt: ['$proOwner.isVerified', 0] },
        planCode: { $arrayElemAt: ['$subPlan.code', 0] },
      },
    },
    {
      $addFields: {
        // Position prioritaire : PREMIUM > PRO > FREE (triées ensuite sur `rank`).
        rank: {
          $switch: {
            branches: [
              { case: { $eq: ['$planCode', 'PREMIUM'] }, then: 2 },
              { case: { $eq: ['$planCode', 'PRO'] }, then: 1 },
            ],
            default: 0,
          },
        },
      },
    },
  ];
}
