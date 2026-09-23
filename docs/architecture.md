# Architecture — LIGAN+

## Vue d'ensemble

LIGAN+ est un monorepo simple composé de **deux applications indépendantes** :

```
LIGAN+/
├── frontend/     Site statique React + TypeScript + Vite + Tailwind CSS
├── backend/      API REST Node.js + TypeScript + Express + MongoDB Atlas (Mongoose)
└── docs/         Documentation du projet
```

Le frontend et le backend sont **déployables séparément**. Le frontend est un site statique
qui ne dépend du backend qu'au runtime, via une URL d'API configurable (`VITE_API_URL`).

## Dépendances externes

| Composant | Choix | Note |
| --- | --- | --- |
| Base de données | MongoDB Atlas (mongoose) | Connexion en ligne, aucune installation locale |
| Images | Cloudinary (prévu, Sprint 3+) | URL + métadonnées en base, jamais de `Buffer` |
| Cartographie | Google Maps (lien uniquement) | Itinéraire final via lien `https://maps.google.com/?q=lat,lng` |
| Emails | SMTP / Brevo (prévu, Sprint 1) | Emails transactionnels + interface responsive |

## Architecture backend (modulaire)

```
backend/src/
├── config/          env.ts, database.ts (Mongoose/Atlas)
├── middlewares/     errorHandler.ts (AppError, 404, 500)
├── utils/           ApiResponse.ts (success, paginated, failure)
├── modules/         un dossier par domaine :
│   ├── health/      (Sprint 0)
│   ├── auth/        (Sprint 1)
│   ├── users/       categories/ services/ opening-hours/ businesses/
│   ├── reviews/     subscriptions/ analytics/ admin/
├── app.ts           instanciation Express (helmet, cors, json, routes…)
└── server.ts        démarrage + connexion DB + arrêt propre
```

Flux d'une requête : `Route → Middleware → Controller → Service → Repository → Mongoose Model → MongoDB Atlas`.

## Architecture frontend

```
frontend/src/
├── components/
│   ├── ui/           design system : Button, Input, Card, Badge, Modal, …
│   └── shared/       composants transverses (ThemeToggle, …)
├── layouts/          PublicLayout / DashboardLayout / AdminLayout
├── pages/            pages par route
├── features/         auth, businesses, search, categories, reviews, subscriptions, analytics, settings
├── hooks/  services/ lib/  utils/  types/  constants/  routes/
├── styles/
│   └── tokens.css    design tokens (thème clair + sombre)
└── main.tsx
```

## Communication frontend ↔ backend

- **Dev** : Vite proxifie `/api` vers `http://localhost:5000` (`vite.config.ts`).
- **Prod** : le frontend (site statique) appelle `VITE_API_URL + /api/...`. Si `VITE_API_URL`
  est vide, il utilise des chemins relatifs (même domaine).

## Stack technique détaillée

- **Frontend** : React 19, TypeScript, Vite 8, Tailwind CSS v4 (config CSS-first), React Router,
  TanStack Query, React Hook Form, Zod, lucide-react.
- **Backend** : Node.js 22, TypeScript (NodeNext), Express 5, Mongoose 8, dotenv, helmet, cors, morgan.
  Ajouts prévus : JWT, bcrypt, zod, rate limiting, mongo-sanitize.

## Principe de découpage en sprints

Voir `docs/roadmap.md`. Chaque sprint est indépendant et se termine par un compte-rendu.