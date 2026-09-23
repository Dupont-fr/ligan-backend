# Déploiement — LIGAN+

Le frontend et le backend sont **indépendants** et déployables séparément.

## Frontend (site statique)

Build :

```bash
cd frontend
npm run build   # produit dist/
```

Le build ne dépend **pas** du backend : il faut juste fournir `VITE_API_URL` (URL de l'API
backend) au moment du build ou du déploiement.

Cibles possibles :

- **GitHub Pages** : déployer le contenu de `frontend/dist` (workflow GitHub Actions).
- **Vercel / Netlify** : `root: frontend`, `build: npm run build`, `publish: dist`.
- **Tout hébergement statique** (nginx, S3, …).

En local, sans `VITE_API_URL`, l'app appelle `/api/...` en relatif (proxy Vite en dev).

### Workflow GitHub Pages (à créer à la demande)

```yaml
# .github/workflows/frontend.yml (suggestion)
name: Deploy frontend
on:
  push:
    branches: [main]
    paths: ['frontend/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: cd frontend && npm ci && npm run build
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: frontend/dist
```

NB : pour GitHub Pages, penser à définir `base` dans `vite.config.ts` si le site est servi sous
un sous-chemin (`/repo/`).

## Backend (API)

Prérequis : Node ≥ 20, MongoDB Atlas.

```bash
cd backend
npm install
npm run build     # compile dist/
npm run start     # node dist/server.js
```

Variables requises (voir `.env.example`) :

```
PORT
MONGODB_URI
JWT_SECRET / JWT_REFRESH_SECRET   (Sprint 1)
FRONTEND_URL                       (origine autorisée par CORS)
```

Cibles : Render, Railway, Fly.io, ou une VM avec nginx + HTTPS.

## CORS

Le backend n'autorise que l'origine `FRONTEND_URL` en production (configurée dans
`backend/src/app.ts`). En développement, toutes les origines sont acceptées.

## Sécurité en production

- Flags : HTTPS obligatoire, secrets via la plateforme d'hébergement (jamais en dur), logs.
- Index MongoDB (`2dsphere`, `slug`, `categoryId`, `city`, `status`) — Sprint 15.