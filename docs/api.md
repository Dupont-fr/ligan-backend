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

## Compte utilisateur (CRUD)

| Méthode | Chemin | Accès | Description |
| --- | --- | --- | --- |
| `GET` | `/api/auth/me` | connecté | profil courant |
| `PATCH` | `/api/auth/me` | connecté | modifier `firstName` / `lastName` / `phone` (vide = effacer) |
| `DELETE` | `/api/auth/me` | connecté | suppression définitive — requiert `{ "password": "…" }` ; cascade : activités + sollicitations (envoyées/reçues), cookies effacés |
| `POST` | `/api/auth/bootstrap-admin` | public | crée le **premier** ADMIN — refusé (409) dès qu'un admin existe ; si `BOOTSTRAP_TOKEN` est défini, exiger le header `x-bootstrap-token` |

## Gestion des comptes (ADMIN)

Voir aussi `backend/api.rest` (extension REST Client) pour le scénario complet : bootstrap → login → création d'admins.

| Méthode | Chemin | Accès | Description |
| --- | --- | --- | --- |
| `GET` | `/api/admin/stats` | ADMIN | compteurs : utilisateurs (par rôle), activités, catégories, sollicitations (par statut) |
| `GET` | `/api/admin/users` | ADMIN | liste des comptes (200 max, tri décroissant) |
| `POST` | `/api/admin/users` | ADMIN | crée un compte `{ firstName, lastName, email, phone?, password, role }` — `role` ∈ `CUSTOMER`/`PROFESSIONAL`/`ADMIN`, créé `isVerified: true` (409 si email existant) |
| `PATCH` | `/api/admin/users/:id` | ADMIN | modifie `firstName` / `lastName` / `phone` / `role` / `isVerified` — garde-fous : 422 si on touche à son propre rôle, 409 si rétrogradation du dernier admin |
| `DELETE` | `/api/admin/users/:id` | ADMIN | supprime un compte (cascade activités + sollicitations) — garde-fous : 422 sur soi-même, 409 sur le dernier admin |

## Catégories (Sprint 2)

| Méthode | Chemin | Accès | Description |
| --- | --- | --- | --- |
| `GET` | `/api/categories` | public | catégories actives, triées (`order`, `name`) |
| `GET` | `/api/categories?all=1` | ADMIN | toutes les catégories (inclus inactives) |
| `POST` | `/api/categories` | ADMIN | création (`name`, `slug` unique, `parentId?`, `order?`, `active?`) |
| `PATCH` | `/api/categories/:id` | ADMIN | mise à jour ; un renommage synchronise `Activity.category` |
| `DELETE` | `/api/categories/:id` | ADMIN | refusé si sous-catégories ou activités liées (409) |

Réponse publique :

```json
{
  "success": true,
  "data": {
    "categories": [
      { "id": "…", "name": "Plomberie", "slug": "plomberie", "parentId": null, "order": 20, "active": true }
    ]
  }
}
```

## Activités (Sprint 3)

| Méthode | Chemin | Accès | Description |
| --- | --- | --- | --- |
| `GET` | `/api/activities` | public | liste ; filtres `?q=` (titre, description, catégorie, ville, zone) et `?category=` |
| `GET` | `/api/activities/mine` | PROFESSIONAL | activités du pro connecté |
| `POST` | `/api/activities` | PROFESSIONAL | création — corps complet du wizard |
| `PATCH` | `/api/activities/:id` | PROFESSIONAL | mise à jour complète (remplacement partiel ; retrait des photos = suppression du fichier local legacy) |
| `DELETE` | `/api/activities/:id` | PROFESSIONAL | suppression en cascade de ses photos locales |

Corps de création **et** de modification :

```json
{
  "title": "Réparation de fuite d’eau",
  "description": "10 à 2000 caractères",
  "category": "Plomberie",
  "price": "5 000 FCFA / intervention",
  "location": "Douala et environs",
  "services": [{ "name": "Débouchage de canalisation", "price": "5000 FCFA" }],
  "contacts": { "phone": "690000000", "whatsapp": "691111111", "email": "contact@exemple.com" },
  "openingHours": [
    { "day": "MON", "open": "08:00", "close": "18:00", "closed": false }
  ],
  "address": { "city": "Douala", "district": "Akwa", "street": "Rue Njo-Njo" },
  "photos": ["https://res.cloudinary.com/<cloud>/image/upload/v1/photo.jpg"]
}
```

- `photos` : **0 à 8 URL Cloudinary** (`https://res.cloudinary.com/…`) — l'upload se fait **côté client**
  (unsigned preset, `VITE_CLOUDINARY_*`), le serveur valide (`photoUrlRegex`) et stocke l'URL.
  Les URLs locales `/uploads/…` restent acceptées (compatibilité).
- Contraintes : `title` ≥ 3, `description` ≥ 10, `contacts.phone` requis, `openingHours` ≥ 1 jour
  (jours uniques, format `HH:MM`), `address.city` ≥ 2.

## Sprints suivants (prévus)

- `GET /api/businesses/:slug` (Sprint 4)
- `GET /api/businesses/search?q=&latitude=&longitude=&radius=…` via `$geoNear` (Sprint 5–6)
- Avis, abonnements, analytics, admin (Sprints 9–12)