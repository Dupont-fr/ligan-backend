import { z } from 'zod';
import { BUSINESS_EVENT_TYPES } from '../../models/BusinessEvent.js';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const trackEventSchema = z.object({
  activityId: z.string().trim().regex(objectIdRegex, 'Identifiant invalide'),
  type: z.enum(BUSINESS_EVENT_TYPES),
  sessionId: z.string().trim().max(64).optional(),
});
export type TrackEventInput = z.infer<typeof trackEventSchema>;

export const statsQuerySchema = z.object({
  period: z.enum(['today', '7d', '30d']).default('7d'),
});
export type StatsQueryInput = z.infer<typeof statsQuerySchema>;

export const historyQuerySchema = z.object({
  range: z.enum(['30d', '90d', '12mo']).default('30d'),
});
export type HistoryQueryInput = z.infer<typeof historyQuerySchema>;
