# Base de données — LIGAN+

MongoDB Atlas, ODM Mongoose. La connexion est faite dans `backend/src/config/database.ts`
(URI depuis `MONGODB_URI`). Le serveur démarre même sans base (mode dégradé) et le health check
expose l'état réel de la connexion.

## Collections prévues

| Collection | Description |
| --- | --- |
| `users` | comptes (CUSTOMER / PROFESSIONAL / ADMIN) |
| `businesses` | fiches d'activité |
| `categories` | arborescence (parent/enfant via `parentId`) |
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

## Scripts / seed

Aucun seed au Sprint 0 (hors modèles). Les seeds de catégories et de plans viennent au Sprint 2+.