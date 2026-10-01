import bcrypt from 'bcryptjs';
import env from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { Category } from './models/Category.js';
import { Plan, PLAN_CODES } from './models/Plan.js';
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

// Prix de référence (FCFA/mois) — modifiables ensuite en base via l'admin,
// jamais réappliqués sur un plan déjà créé (règle sprint 12).
const PLANS: Array<{
  code: (typeof PLAN_CODES)[number];
  name: string;
  price: number;
  durationDays: number;
  order: number;
  highlight: boolean;
  features: string[];
}> = [
  {
    code: 'FREE',
    name: 'Découverte',
    price: 0,
    durationDays: 0,
    order: 10,
    highlight: false,
    features: [
      'Fiche professionnelle publique',
      '1 activité affichée',
      'Avis clients',
      'Support standard',
    ],
  },
  {
    code: 'PRO',
    name: 'Pro',
    price: 1000,
    durationDays: 30,
    order: 20,
    highlight: true,
    features: [
      'Activités illimitées',
      'Visibilité renforcée dans les recherches',
      'Statistiques de consultation',
      'Support prioritaire',
    ],
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    price: 2500,
    durationDays: 30,
    order: 30,
    highlight: false,
    features: [
      'Tous les avantages Pro',
      'Badge Premium sur la fiche',
      'Position en tête des résultats',
      'Accompagnement dédié',
    ],
  },
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

  let plansCreated = 0;
  for (const def of PLANS) {
    const existing = await Plan.findOne({ code: def.code });
    if (existing) {
      // Prix/durée jamais écrasés : ils sont modifiables par les admins en base.
      existing.name = def.name;
      existing.features = def.features;
      existing.highlight = def.highlight;
      existing.order = def.order;
      await existing.save();
    } else {
      await Plan.create(def);
      plansCreated += 1;
    }
  }
  logger.info(`Plans d'abonnement : ${PLANS.length} au total, ${plansCreated} créé(s).`);

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
