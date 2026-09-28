import bcrypt from 'bcryptjs';
import env from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { Category } from './models/Category.js';
import { User } from './models/User.js';
import { logger } from './utils/logger.js';

const CATEGORIES: Array<{ name: string; slug: string; order: number }> = [
  { name: 'Bâtiment & Rénovation', slug: 'batiment', order: 10 },
  { name: 'Plomberie', slug: 'plomberie', order: 20 },
  { name: 'Électricité', slug: 'electricite', order: 30 },
  { name: 'Mécanique', slug: 'mecanique', order: 40 },
  { name: 'Coiffure & Beauté', slug: 'beaute', order: 50 },
  { name: 'Ménage & Nettoyage', slug: 'menage', order: 60 },
  { name: 'Informatique & Tech', slug: 'informatique', order: 70 },
  { name: 'Cours particuliers', slug: 'cours', order: 80 },
  { name: 'Cuisine & Traiteur', slug: 'cuisine', order: 90 },
  { name: 'Santé & Bien-être', slug: 'bienetre', order: 100 },
];

async function seed() {
  if (!env.mongoUri) {
    logger.error('MONGODB_URI absent — seed impossible.');
    process.exit(1);
  }
  await connectDatabase();

  let created = 0;
  for (const cat of CATEGORIES) {
    const existing = await Category.findOne({ slug: cat.slug });
    if (existing) {
      existing.name = cat.name;
      existing.order = cat.order;
      await existing.save();
    } else {
      await Category.create({ name: cat.name, slug: cat.slug, order: cat.order, active: true });
      created += 1;
    }
  }
  logger.info(`Catégories : ${CATEGORIES.length} au total, ${created} créée(s).`);

  if (env.admin.password) {
    const email = env.admin.email || 'admin@ligan.plus';
    const existingAdmin = await User.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      existingAdmin.role = 'ADMIN';
      existingAdmin.isVerified = true;
      await existingAdmin.save();
      logger.info(`Compte admin existant promu : ${email}`);
    } else {
      const passwordHash = await bcrypt.hash(env.admin.password, 12);
      await User.create({
        firstName: 'Admin',
        lastName: 'LIGAN+',
        email: email.toLowerCase(),
        passwordHash,
        role: 'ADMIN',
        isVerified: true,
      });
      logger.info(`Compte admin créé : ${email}`);
    }
  } else {
    logger.warn('ADMIN_PASSWORD absent : aucun compte admin créé (définissez ADMIN_EMAIL/ADMIN_PASSWORD).');
  }

  await disconnectDatabase();
  logger.info('Seed terminé.');
  process.exit(0);
}

seed().catch((err) => {
  logger.error(`Échec du seed : ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
