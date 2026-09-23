# LIGAN+

**LIGAN+** est une plateforme SaaS de découverte de professionnels locaux (mécaniciens, plombiers, coiffeurs, boulangeries, etc.). Les professionnels créent et gèrent leur fiche d'activité ; les clients trouvent, à proximité, le professionnel qui répond à leur besoin et le contactent directement (appel, WhatsApp, itinéraire Google Maps).

> Trouvez le professionnel qu'il vous faut, près de chez vous.

Ce dépôt (`ligan-backend`) contient **l'API REST**. Le **frontend** vit dans un dépôt GitHub
séparé (`ligan-frontend`), déployé indépendamment sur GitHub Pages. Les deux repos sont
entièrement autonomes : le site statique n'appelle le backend qu'au runtime via `VITE_API_URL`.

```
ligan-backend/    API REST Node.js + TypeScript + Express + MongoDB Atlas (Mongoose)
ligan-frontend/   Site statique React + Vite + Tailwind (dépôt distinct)
```

## Backend — structure

```
backend/ (ce dépôt)
├── src/
│   ├── config/          env.ts, database.ts (connexion MongoDB Atlas)
│   ├── middlewares/     errorHandler.ts (404, 500, AppError)
│   ├── utils/           ApiResponse.ts (success, paginated, failure)
│   ├── modules/         health (Sprint 0), puis auth, businesses, categories…
│   ├── app.ts           Express (helmet, cors, json, routes)
│   └── server.ts        démarrage + connexion DB + arrêt propre
├── docs/                architecture, design system, base de données, API, déploiement, roadmap
├── tests/               à venir (Sprint 16)
├── package.json
└── tsconfig.json
```

## Prérequis

- Node.js ≥ 20 (testé avec v22)
- npm ≥ 10
- Un compte MongoDB Atlas (base en ligne, aucun outil local requis)

## Démarrage rapide (développement)

```bash
npm install
cp .env.example .env   # renseigner MONGODB_URI (ex. mongodb+srv://…), JWT_SECRET, FRONTEND_URL
npm run dev            # http://localhost:5000
```

Health check : `GET http://localhost:5000/api/health`

Scripts : `npm run dev` · `npm run build` · `npm run start` · `npm run typecheck` · `npm run lint` · `npm run format`.

## Variables d'environnement

Voir `backend/.env.example`. **Ne jamais committer `.env`** (il est ignoré par git).

## Déploiement (backend)

1. Pousser ce dépôt sur GitHub (`ligan-backend`).
2. Le déployer sur une plateforme Node (Render, Railway, Fly.io, VM + nginx…) :
   - NODE_ENV=production, PORT=8000, MONGODB_URI, JWT_SECRET / JWT_REFRESH_SECRET, FRONTEND_URL (origine autorisée par CORS).
   - Build : `npm run build` · Start : `npm run start`.
3. Renseigner le secret `VITE_API_URL` dans le dépôt `ligan-frontend` (Settings → Secrets).

Détails : `docs/deployment.md`.

## Documentation

- `docs/architecture.md`
- `docs/design-system.md`
- `docs/database.md`
- `docs/api.md`
- `docs/authentication.md`
- `docs/deployment.md`
- `docs/roadmap.md`

## Cible (MVP)

Professionnel → crée un compte → crée son activité (métier, services, horaires, téléphone, WhatsApp, localisation, photos) → publie.
Client → cherche un service → autorise sa position → voit les professionnels proches → ouvre une fiche → appelle / WhatsApp / itinéraire Google Maps.

---

© 2026 LIGAN+ — Développé par sprints (voir `docs/roadmap.md`).