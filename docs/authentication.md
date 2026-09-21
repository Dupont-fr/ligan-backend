# Authentification — Ligan+

Sprint 1 — ✅ Terminé.

## Fonctionnalités livrées

- **Register** avec vérification par email envoyée automatiquement à la création du compte
  (accès bloqué tant que non vérifié ; lien valable 24 h, à usage unique, hashé en base) ;
- **Login / Logout** ;
- **JWT d'accès** (15 min, cookie HttpOnly `ligan_access`) + **refresh token opaque**
  (30 jours, cookie HttpOnly `ligan_refresh`, rotation à chaque usage, stocké hashé SHA-256) ;
- **Mot de passe oublié / réinitialisation** (lien valable 1 h, révoque toutes les sessions) ;
- **Rôles** : `CUSTOMER`, `PROFESSIONAL`, `ADMIN` ;
- Middlewares `requireAuth`, `requireRole(...)` ;
- Emails transactionnels au nom de **Ligan+**, HTML responsive (table + styles inline,
  préheader, texte brut associé) via SMTP Brevo ;
- Validation **Zod** (body + query), messages clairs renvoyés sous
  `{ success: false, message, errors }` ;
- **Rate limiting** (`/register` 30/15 min, `/login` 10/15 min, mot de passe 5/h) ;
- **Sanitation NoSQL** (`mongo-sanitize` sur le body) + Helmet + CORS credentials + `trust proxy`.

## Sécurité

- Mots de passe hashés **bcrypt (coût 12)**. Jamais stockés en clair ;
- `passwordHash`, jetons et secrets **jamais exposés** dans les réponses API ;
- Refresh tokens stockés **en hash SHA-256** uniquement (max 5 par utilisateur, rotation) ;
- Réponse `forgot-password` neutre (pas de fuite d'existence de compte) ;
- Cookies `HttpOnly` + `SameSite=Lax` (dev) / `SameSite=None; Secure` (prod).

## Tests manuels (spec Sprint 1) — tous passés

| Cas | Résultat |
| --- | --- |
| Inscription valide → 201, `isVerified: false` + email généré | ✅ |
| Email déjà utilisé → 409 | ✅ |
| Login avant vérification email → 403 | ✅ |
| Mauvais mot de passe → 401 | ✅ |
| Jeton de vérification invalide → 400 | ✅ |
| Vérification valide → `isVerified: true` ; double usage → 400 | ✅ |
| Login valide → cookies HttpOnly + `/me` → 200 | ✅ |
| Refresh (rotation) → nouveau refresh, sessions conservées | ✅ |
| Logout → refresh révoqué, `/me` → 401 | ✅ |
| Forgot → réponse neutre + lien reset généré | ✅ |
| Reset valide → nouveau mdp ; ancien mdp → 401 ; nouveau → 200 | ✅ |
| `/me` sans session → 401 ; mongo-sanitize actif | ✅ |

## Fichiers principaux

- `src/models/User.ts` — modèle + `toPublicUser` (jamais d'infos sensibles)
- `src/middlewares/auth.ts` — `requireAuth`, `requireRole(...)`, noms des cookies
- `src/middlewares/validate.ts` — validation Zod → `AppError(400, errors)`
- `src/modules/auth/{validator,controller,routes}.ts` — schémas + logique + routage
- `src/services/email.ts` — transport SMTP Brevo + templates responsive + repli DEV
- `src/utils/tokens.ts` — JWT accès, refresh opaque, hash SHA-256

## Repli DEV

Sans SMTP (`EMAIL_USER`/`EMAIL_PASS` vides) ou avec `EMAIL_DISABLED=1`, les emails ne partent
pas : le sujet, le destinataire et le contenu (avec le lien) sont logués dans la console du serveur.