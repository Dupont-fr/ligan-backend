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

## Endpoints du Sprint 1 — Authentification

Base : `/api/auth`. Cookies HttpOnly :

- `ligan_access` — JWT d'accès, 15 min, `SameSite=Lax` (dev) / `None; Secure` (prod).
- `ligan_refresh` — refresh token opaque (rotation à chaque usage), 30 jours.

### `POST /api/auth/register`

Crée un compte (CUSTOMER par défaut) et envoie un **email de vérification** (lien valable 24 h).

Body : `{ firstName, lastName, email, password, phone? }` → `201` + `data.user`.
`409` si l'email existe déjà.

### `GET /api/auth/verify-email?token=...`

Valide l'email. `200` + `isVerified: true` ; `400` si jeton invalide/expiré (jeton à usage unique).

### `POST /api/auth/login`

Body : `{ email, password }`. Définit les cookies (accès + refresh). `403` si l'email
n'est pas vérifié ; `401` si identifiants incorrects. Rate limit : 10 / 15 min.

### `POST /api/auth/refresh`

Fait tourner le refresh token (ancien révoqué) et renouvelle l'access cookie. `401` si invalide.

### `POST /api/auth/logout`

Révoque le refresh token courant et efface les cookies.

### `GET /api/auth/me` — protégé (`requireAuth`)

Retourne l'utilisateur courant.

### `POST /api/auth/forgot-password`

Body : `{ email }`. Réponse neutre (`200`) quel que soit l'existence du compte. Lien valable 1 h.
Rate limit : 5 / 1 h.

### `POST /api/auth/reset-password`

Body : `{ token, password }`. Réinitialise le mot de passe et révoque toutes les sessions.

---

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

- `GET/POST/PUT/DELETE /api/categories` (admin) (Sprint 2)
- `POST /api/businesses` + formulaire multi-étapes (Sprint 3)
- `GET /api/businesses/:slug` (Sprint 4)
- `GET /api/businesses/search?q=&latitude=&longitude=&radius=…` via `$geoNear` (Sprint 5–6)
- Avis, abonnements, analytics, admin (Sprints 9–12)