import type { Response } from 'express';

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function success(res: Response, data: unknown, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function paginated(res: Response, data: unknown, pagination: Pagination) {
  return res.status(200).json({ success: true, data, pagination });
}

export interface ErrorBody {
  success: false;
  message: string;
  errors?: Record<string, string>;
}

export function failure(res: Response, message: string, status = 400, errors?: ErrorBody['errors']) {
  const body: ErrorBody = errors ? { success: false, message, errors } : { success: false, message };
  return res.status(status).json(body);
}