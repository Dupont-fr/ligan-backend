# API — Ligan+

## Format standard

Succès :

```json
{ "success": true, "data": {} }
```

Erreur :

```json
{ "success": false, "message": "Une erreur est survenue", "errors": {} }
```

Pagination :

```json
{ "success": true, "data": [], "pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 } }
```

Helper backend : `backend/src/utils/ApiResponse.ts` (`success`, `paginated`, `failure`).

## Endpoints du Sprint 0

### `GET /api/health`

Vérifie le bon fonctionnement du backend et de la base.

```json
{
  "success": true,
  "data": {
    "app": "Ligan+",
    "status": "ok",
    "env": "development",
    "version": "0.1.0",
    "uptime": 12,
    "timestamp": "2026-09-21T19:31:02.563Z",
    "db": { "connected": true, "state": "connected" }
  }
}
```

### `GET /`

Réponse de bienvenue de l'API.

## Sprints suivants (prévus)

- `POST /api/auth/register|login|logout`, refresh token, forgot/reset password (Sprint 1)
- `GET/POST/PUT/DELETE /api/categories` (admin) (Sprint 2)
- `POST /api/businesses` + formulaire multi-étapes (Sprint 3)
- `GET /api/businesses/:slug` (Sprint 4)
- `GET /api/businesses/search?q=&latitude=&longitude=&radius=…` via `$geoNear` (Sprint 5–6)
- Avis, abonnements, analytics, admin (Sprints 9–12)