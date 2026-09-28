import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../middlewares/errorHandler.js';
import { Activity } from '../../models/Activity.js';
import { Category, toPublicCategory } from '../../models/Category.js';
import { success } from '../../utils/ApiResponse.js';
import type { CreateCategoryInput, ListCategoriesInput, UpdateCategoryInput } from './validator.js';

export async function listCategories(req: Request, res: Response) {
  const { all } = (req.validQuery ?? {}) as ListCategoriesInput;

  if (all === '1') {
    if (req.user?.role !== 'ADMIN') {
      throw new AppError('Accès refusé', 403);
    }
    const categories = await Category.find().sort({ order: 1, name: 1 });
    return success(res, { categories: categories.map((c) => toPublicCategory(c)) });
  }

  const categories = await Category.find({ active: true }).sort({ order: 1, name: 1 });
  return success(res, { categories: categories.map((c) => toPublicCategory(c)) });
}

export async function createCategory(req: Request, res: Response) {
  const input = req.validBody as CreateCategoryInput;

  const existing = await Category.findOne({ slug: input.slug });
  if (existing) {
    throw new AppError('Ce slug est déjà utilisé', 409);
  }
  if (input.parentId) {
    const parent = await Category.findById(input.parentId);
    if (!parent) {
      throw new AppError('Catégorie parente introuvable', 404);
    }
  }

  const category = await Category.create({
    name: input.name,
    slug: input.slug,
    parentId: input.parentId ?? null,
    ...(input.order !== undefined ? { order: input.order } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  });

  return success(res, { category: toPublicCategory(category) }, 201);
}

export async function updateCategory(req: Request, res: Response) {
  const { id } = req.validParams as { id: string };
  const input = req.validBody as UpdateCategoryInput;

  const category = await Category.findById(id);
  if (!category) {
    throw new AppError('Catégorie introuvable', 404);
  }

  if (input.slug && input.slug !== category.slug) {
    const existing = await Category.findOne({ slug: input.slug });
    if (existing) {
      throw new AppError('Ce slug est déjà utilisé', 409);
    }
  }
  if (input.parentId) {
    if (input.parentId === id) {
      throw new AppError('Une catégorie ne peut pas être sa propre parente', 422);
    }
    const parent = await Category.findById(input.parentId);
    if (!parent) {
      throw new AppError('Catégorie parente introuvable', 404);
    }
  }

  const oldName = category.name;

  if (input.name !== undefined) category.name = input.name;
  if (input.slug !== undefined) category.slug = input.slug;
  if (input.parentId !== undefined) {
    category.parentId = input.parentId ? new Types.ObjectId(input.parentId) : null;
  }
  if (input.order !== undefined) category.order = input.order;
  if (input.active !== undefined) category.active = input.active;

  await category.save();

  // Les activités référencent la catégorie par son nom : on synchronise.
  if (input.name !== undefined && input.name !== oldName) {
    await Activity.updateMany({ category: oldName }, { category: category.name });
  }

  return success(res, { category: toPublicCategory(category) });
}

export async function deleteCategory(req: Request, res: Response) {
  const { id } = req.validParams as { id: string };

  const category = await Category.findById(id);
  if (!category) {
    throw new AppError('Catégorie introuvable', 404);
  }

  const children = await Category.countDocuments({ parentId: category._id });
  if (children > 0) {
    throw new AppError('Supprimez d’abord les sous-catégories de cette catégorie', 409);
  }

  const activityCount = await Activity.countDocuments({ category: category.name });
  if (activityCount > 0) {
    throw new AppError(
      `${activityCount} activité(s) utilisent cette catégorie. Désactivez-la plutôt que de la supprimer.`,
      409,
    );
  }

  await category.deleteOne();
  return success(res, { message: 'Catégorie supprimée' });
}
