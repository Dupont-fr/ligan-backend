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
| `GET` | `/api/admin/stats` | ADMIN | compteurs : utilisateurs (par rôle, `suspended`), activités (`approved`/`pending`/`rejected`/`suspended`), catégories, sollicitations (par statut) |
| `GET` | `/api/admin/users` | ADMIN | liste des comptes (200 max, tri décroissant) — inclut `suspended`, `suspendedAt`, `suspendedReason` |
| `POST` | `/api/admin/users` | ADMIN | crée un compte `{ firstName, lastName, email, phone?, password, role }` — `role` ∈ `CUSTOMER`/`PROFESSIONAL`/`ADMIN`, créé `isVerified: true` (409 si email existant) |
| `PATCH` | `/api/admin/users/:id` | ADMIN | modifie `firstName` / `lastName` / `phone` / `role` / `isVerified` — garde-fous : 422 si on touche à son propre rôle, 409 si rétrogradation du dernier admin |
| `PATCH` | `/api/admin/users/:id/suspend` | ADMIN | `{ suspended: boolean, reason? }` — `reason` **obligatoire** (≥ 3 car.) si `suspended: true` ; suspension = révocation des sessions (`refreshTokens` vidés) et **login/refresh bloqués (403)** ; garde-fous : 422 sur soi-même, 409 sur le dernier admin |
| `DELETE` | `/api/admin/users/:id` | ADMIN | supprime un compte (cascade activités + sollicitations) — garde-fous : 422 sur soi-même, 409 sur le dernier admin |

## Modération des activités (Sprint 9)

Champ `status` sur `Activity` : `PENDING` (défaut à la création) · `APPROVED` · `REJECTED` · `SUSPENDED`,
avec `moderationReason`, `moderatedBy`, `moderatedAt`. **Seules les activités `APPROVED` sont visibles
publiquement** (`GET /api/activities`, `/api/businesses/search`, `/api/businesses/:slug` — un 404 y est
renvoyé sinon, sauf pour le propriétaire de l'activité et les ADMIN qui peuvent prévisualiser).

| Méthode | Chemin | Accès | Description |
| --- | --- | --- | --- |
| `GET` | `/api/admin/activities` | ADMIN | liste paginée `{ activities, total, page, pages }` — query `status`, `q` (titre/description/catégorie/slug), `professionalId`, `page`, `limit` (1–50, défaut 20) ; `professional` enrichi de l'email |
| `PATCH` | `/api/admin/activities/:id/status` | ADMIN | `{ status: APPROVED\|REJECTED\|SUSPENDED, reason? }` — `reason` **obligatoire** (≥ 3 car.) pour `REJECTED`/`SUSPENDED`, effacé à la validation ; 404 si introuvable, 409 si déjà dans ce statut |

- La création (`POST /api/activities`) démarre en `PENDING` ; la modification par le pro **ne
  repasse pas** l'activité en attente (modération a posteriori des éditions).
- Les actions admin sont journalisées (`logger.info` avec motif).

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
| `GET` | `/api/activities` | public | liste des activités **`APPROVED` uniquement** ; filtres `?q=` (titre, description, catégorie, ville, zone) et `?category=` |
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
  "latitude": 4.0511,
  "longitude": 9.7679,
  "photos": ["https://res.cloudinary.com/<cloud>/image/upload/v1/photo.jpg"]
}
```

- `latitude`/`longitude` : position GPS **optionnelle** (les deux ensemble ou aucun ; −90…90 /
  −180…180) — stockée en GeoJSON `Point` (`coordinates = [longitude, latitude]`) et indexée
  `2dsphere` pour `$geoNear`. Sans elles, l'activité reste trouvable par la recherche texte.

- `photos` : **0 à 8 URL Cloudinary** (`https://res.cloudinary.com/…`) — l'upload se fait **côté client**
  (unsigned preset, `VITE_CLOUDINARY_*`), le serveur valide (`photoUrlRegex`) et stocke l'URL.
  Les URLs locales `/uploads/…` restent acceptées (compatibilité).
- Contraintes : `title` ≥ 3, `description` ≥ 10, `contacts.phone` requis, `openingHours` ≥ 1 jour
  (jours uniques, format `HH:MM`), `address.city` ≥ 2.

## Fiches publiques (Sprint 4)

| Méthode | Chemin | Accès | Description |
| --- | --- | --- | --- |
| `GET` | `/api/businesses/:slug` | public | fiche publique `/business/:slug` — `{ activity, professional }` (`isVerified`, `memberSince`) ; 400 si slug invalide, 404 si inconnu ou activité non `APPROVED` (visible par son propriétaire et les ADMIN) |

- `slug` est généré à la création depuis le titre (sans accents, tirets, suffixe aléatoire en cas
  de collision) et renvoyé par toutes les listes d'activités (`GET /api/activities`).
- Le slug reste stable lors des modifications de titre.

## Recherche (Sprints 5–6)

| Méthode | Chemin | Accès | Description |
| --- | --- | --- | --- |
| `GET` | `/api/businesses/search` | public | `items[]`, `count`, `total`, `page`, `pages`, `geo`, `sort` |

Query : `q` (titre/description/catégorie), `category` (exacte), `city`, `latitude`, `longitude`
(ensemble), `radius` (100 m – 100 km, défaut 20 km), `sort` (`recent` — défaut sans geo, `distance`
— défaut avec geo, `name`), `openNow`, `hasPhotos`, `verified` (`true`/`false`), `limit` (1–50,
défaut 20), `page` (défaut 1).

- **Avec coords** : `$geoNear` sphérique → tri par distance, champ `distance` (mètres, arrondi).
  `sort=recent|name` s'applique ensuite ; `sort=distance` sans coords retombe sur `recent`.
- **Sans coords** : `$match` classique.
- Filtres : `verified` via `$lookup` sur `users`, `hasPhotos` via `$expr` sur `photos`, `openNow`
  appliqué après l'agréation (horaires du jour, plage passant minuit gérée).
- Collation `fr` (strength 2) : tris et égalités insensibles casse/accents.
- 400 si `latitude` seule (ou inverse), hors plage, `radius` hors bornes, `sort`/`page` invalides.
  `/search` est déclaré avant `/:slug`.

## Analytics (Sprint 10)

Events d'interaction sur les fiches publiques, agrégés par le pro. La route de tracking est
**publique** et limitée à **60 requêtes / 15 min** par IP ; la déduplication des vues est faite
côté client (1 `PROFILE_VIEW` par activité et par jour, `sessionId` anonyme fourni par le front).

| Méthode | Chemin | Accès | Description |
| --- | --- | --- | --- |
| `POST` | `/api/analytics/events` | public | `{ activityId, type, sessionId? }` — `type` ∈ `PROFILE_VIEW` · `PHONE_CLICK` · `WHATSAPP_CLICK` · `DIRECTION_CLICK` ; 404 si l'activité est introuvable ou non `APPROVED` |
| `GET` | `/api/analytics/stats?period=` | PROFESSIONAL | `period` ∈ `today` · `7d` (défaut) · `30d` — renvoie `totals` (par type), `total`, et `byActivity[]` (`id`, `title`, `status`, `counts`, `total`) pour les activités du pro |
| `GET` | `/api/analytics/overview?period=` | ADMIN | même forme que `/stats` mais sur **toute la plateforme** — `byActivity[]` trié décroissant (activités ayant reçu ≥ 1 event), avec `professional` (`firstName`, `lastName`) ; les `totals` incluent les events d'activités supprimées |

## Avis et réputation (Sprint 11)

Les avis démarrent en `PENDING` : ils ne deviennent visibles publiquement (liste **et** note
moyenne de la fiche) qu'après approbation par un admin. Un seul avis par (utilisateur, activité).

| Méthode | Chemin | Accès | Description |
| --- | --- | --- | --- |
| `POST` | `/api/reviews` | CUSTOMER · PROFESSIONAL | `{ activityId, rating (1–5), comment (10–1000 car.) }` → 201 `PENDING` + `review` (auteur inclus) ; 401 sans session · 403 pour un ADMIN · 404 activité inconnue · 409 doublon · 422 auto-avis du propriétaire · 400 Zod |
| `DELETE` | `/api/reviews/:id` | auteur uniquement | 200 ; 403 si un autre utilisateur (admin compris), 404 si introuvable |
| `GET` | `/api/businesses/:slug` | public | enrichi : `rating { average, count }` (agrégation `APPROVED`, arrondi 1 déc.) + `reviews[]` (50 derniers `APPROVED`, décroissants, auteur = prénom + nom) |
| `GET` | `/api/admin/reviews?status=&q=&page=&limit=` | ADMIN | liste paginée avec `reviewer` (dont email) et `activity` ; filtres `status` ∈ `PENDING` · `APPROVED` · `REJECTED`, recherche `q` sur le commentaire (regex échappée) |
| `PATCH` | `/api/admin/reviews/:id/status` | ADMIN | `{ status: APPROVED \| REJECTED, reason? }` — `reason` **obligatoire (≥ 3 car.)** si `REJECTED` ; 404 introuvable · 409 même statut · enregistre `moderatedBy` / `moderatedAt` / `moderationReason` |

`GET /api/admin/stats` inclut `stats.reviews { total, pending, approved, rejected }`.

## Sprints suivants (prévus)

- Abonnements, paiements (Sprints 12–13)