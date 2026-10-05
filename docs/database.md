# Base de données — LIGAN+

MongoDB Atlas, ODM Mongoose. La connexion est faite dans `backend/src/config/database.ts`
(URI depuis `MONGODB_URI`). Le serveur démarre même sans base (mode dégradé) et le health check
expose l'état réel de la connexion.

## Collections prévues

| Collection | Description |
| --- | --- |
| `users` | comptes (CUSTOMER / PROFESSIONAL / ADMIN) |
| `businesses` | fiches d'activité |
| `categories` | arborescence (parent/enfant via `parentId`) — modèle `Category` (Sprint 2) |
| `services` | prestations d'une activité |
| `openhours` | horaires d'ouverture |
| `businessimages` | photos d'une activité |
| `reviews` | avis + notes |
| `plans` | offres (FREE / PRO / PREMIUM) |
| `subscriptions` | abonnements d'une activité |
| `businessevents` | interactions mesurées |

Modèles détaillés à venir sprint par sprint (auth → catégories → business → …).

## Localisation (exigence forte)

Chaque activité publiée possède un champ GeoJSON **`Point`** indexé en `2dsphere` :

```js
location: {
  type: { type: String, enum: ['Point'], default: 'Point' },
  coordinates: { type: [Number], required: true }, // [longitude, latitude]
}
```

Index requis via `ensureIndexes()` / script d'init :
- `{ location: '2dsphere' }`
- `{ slug: 1 }` (unique)
- `{ categoryId: 1 }`, `{ city: 1 }`, `{ status: 1 }`

Ne jamais modéliser la localisation en deux champs `latitude`/`longitude` séparés.

## Modération (Sprint 9)

- `activities.status` : `PENDING` (défaut à la création) · `APPROVED` · `REJECTED` · `SUSPENDED` —
  index `{ status: 1 }` ; seules les activités `APPROVED` sont exposées publiquement. Accompagné de
  `moderationReason` (≤ 500 car.), `moderatedBy` (réf. `User`), `moderatedAt`.
- `users.suspendedAt` (Date) + `users.suspendedReason` : compte suspendu par un admin — login et
  refresh refusés (403), `refreshTokens` vidés à la suspension.

## Analytics (Sprint 10)

Collection `businessevents` (modèle `BusinessEvent`) :

| Champ | Type | Description |
| --- | --- | --- |
| `activityId` | réf. `Activity` | activité concernée |
| `type` | enum | `PROFILE_VIEW` · `PHONE_CLICK` · `WHATSAPP_CLICK` · `DIRECTION_CLICK` |
| `sessionId` | string (optionnel) | identifiant visiteur anonyme fourni par le front (jamais d'IP) |
| `createdAt` | Date | horodatage (timestamps Mongoose) |

- Index composite : `{ activityId: 1, type: 1, createdAt: -1 }` — servi par l'agrégation
  `GET /api/analytics/stats`.
- Un event n'est créé que pour une activité **`APPROVED`** (contrôlé à l'écriture).
- Pas de purge pour l'instant (volume faible) ; la rétention sera décidée au lancement.

## Avis (Sprint 11)

Collection `reviews` (modèle `Review`) :

| Champ | Type | Description |
| --- | --- | --- |
| `reviewerId` | réf. `User` | auteur de l'avis |
| `activityId` | réf. `Activity` | activité notée |
| `rating` | number | note 1–5 |
| `comment` | string | 10–1000 caractères (`trim`) |
| `status` | enum | `PENDING` (défaut) · `APPROVED` · `REJECTED` |
| `moderationReason` | string (optionnel) | motif du refus (≤ 500 car.) |
| `moderatedBy` | réf. `User` (optionnel) | admin ayant statué |
| `moderatedAt` | Date (optionnel) | date de la modération |

- **Index unique** `{ reviewerId: 1, activityId: 1 }` : un seul avis par utilisateur et par activité
  (doublon intercepté → 409).
- Index de lecture : `{ activityId: 1, status: 1, createdAt: -1 }` — servi par la fiche publique
  (50 derniers `APPROVED`, décroissants) et par la liste admin.
- Seuls les avis **`APPROVED`** alimentent la note moyenne et la liste publique de
  `GET /api/businesses/:slug` (`rating { average, count }` — agrégation `APPROVED`, arrondie à
  1 décimale, et `reviews[]`).
- L'identité exposée publiquement est limitée au **prénom + nom** (`toPublicReview`) ; l'admin
  reçoit en plus l'email via `populate`.
- Auto-avis (propriétaire de l'activité) refusé en 422 ; un `ADMIN` ne peut pas poster (403).

## Plans, abonnements et paiements (Sprint 12)

Collection `plans` (modèle `Plan`) :

| Champ | Type | Description |
| --- | --- | --- |
| `code` | enum unique | `FREE` · `PRO` · `PREMIUM` |
| `name` | string | libellé affiché (`Découverte`, `Pro`, `Premium`) |
| `price` | number | prix en **FCFA** (0 pour FREE) — modifiable par un admin, jamais réappliqué par le seed |
| `durationDays` | number | durée d'activation après paiement ; **0 = illimité** (FREE) |
| `features[]` | string[] | avantages descriptifs (informatifs jusqu'au sprint 14) |
| `highlight` | boolean | plan mis en avant (« Le plus choisi ») |
| `order` · `isActive` | number · boolean | ordre d'affichage · visibilité publique |

Collection `subscriptions` (modèle `Subscription`) :

| Champ | Type | Description |
| --- | --- | --- |
| `userId` | réf. `User`, **unique** | 1 compte pro = 1 abonnement |
| `planId` | réf. `Plan` | plan courant |
| `status` | enum | `ACTIVE` (défaut) · `EXPIRED` · `CANCELED` |
| `startDate` · `endDate` | Date · Date (optionnel) | `endDate` absent = illimité (FREE) ; dépassé → `EXPIRED` à l'accès (lazy) |
| `activatedByPayment` | réf. `Payment` (optionnel) | paiement à l'origine de l'activation |

Collection `payments` (modèle `Payment`) :

| Champ | Type | Description |
| --- | --- | --- |
| `userId` · `planId` | réf. `User` · réf. `Plan` | acheteur et plan visé |
| `amount` · `currency` | number · string | montant exact attendu (FCFA / `XAF`) — re-vérifié au webhook |
| `provider` | enum | `SEBPAY` · `MOCK` |
| `providerRef` | string, **unique sparse** | référence fournisseur (`transaction_id` SebPay) — clé de rapprochement du webhook |
| `network` · `phoneNumber` | enum (optionnel) | `mtn` · `orange` + numéro débité |
| `status` | enum | `PENDING` (défaut) · `SUCCESSFUL` · `FAILED` · `EXPIRED` |
| `failureReason` · `paidAt` | string (optionnel) · Date (optionnel) | motif d'échec · date de confirmation |

- Indexs de lecture : `subscriptions.userId` (unique), `payments.userId + createdAt`, `payments.status`.
- Idempotence : un `SUCCESSFUL` n'est jamais re-transformé (webhook dupliqué = no-op).
- Aucune donnée bancaire n'est stockée : seul le numéro mobile money et la référence fournisseur.

## Scripts / seed

`npm run seed` (`src/seed.ts`) — idempotent :
- upsert des 10 catégories racine (slugs : `batiment`, `plomberie`, `electricite`, `mecanique`,
  `beaute`, `menage`, `informatique`, `cours`, `cuisine`, `bienetre`) ;
- upsert des 3 plans (`FREE` 0 FCFA illimité, `PRO` 1 000 FCFA/30 j, `PREMIUM` 2 500 FCFA/30 j) :
  le seed crée le plan s'il manque et met à jour `name`/`features`/`highlight`/`order`, mais
  **n'écrase jamais `price` / `durationDays`** (ces valeurs vivent en base, gérées par l'admin) ;
- création du compte `ADMIN` si `ADMIN_EMAIL` / `ADMIN_PASSWORD` sont définis dans `.env`
  (sinon : avertissement, aucun compte créé). L'inscription API ne peut pas produire de rôle ADMIN.