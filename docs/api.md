# API — LIGAN+

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

Crée un compte (CUSTOMER par défaut) et envoie un **code de vérification à 6 chiffres**
(cookie non défini — le compte n'est pas connecté).

Body : `{ firstName, lastName, email, password, phone? }` → `201` + `data.user`.
`409` si l'email existe déjà. Code valable 15 min, hashé (SHA-256) en base.

### `POST /api/auth/verify-code`

Valide le code reçu par email, **définit immédiatement les cookies de session**
(l'utilisateur est directement connecté) et passe `isVerified: true`.

Body : `{ email, code }` (code : 6 chiffres). `200` (auto-login) ; `400` si code
invalide/expiré. Après 5 tentatives incorrectes, le code est invalidé.

### `POST /api/auth/resend-code`

Renvole un nouveau code. Body : `{ email, purpose: "verify" | "reset" }`. Réponse
neutre (`200`) pour éviter la fuite d'existence de compte. Rate limit dédié + compte à rebours côté front.

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

Body : `{ email }`. Réponse neutre (`200`) quel que soit l'existence du compte.
Envoie un **code à 6 chiffres** (valable 15 min). Rate limit : 5 / 1 h.

### `POST /api/auth/verify-reset-code`

Valide le code de réinitialisation avant d'afficher le formulaire de nouveau mot de passe
(étape UX). Body : `{ email, code }` → `200` ; `400` si code invalide/expiré ;
invalidé après 5 tentatives incorrectes.

### `POST /api/auth/reset-password`

Body : `{ email, code, password }`. Réinitialise le mot de passe, révoque
toutes les sessions et efface les cookies.

---

## Endpoints du Sprint 0

### `GET /api/health`

Vérifie le bon fonctionnement du backend et de la base.

```json
{
  "success": true,
  "data": {
    "app": "LIGAN+",
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