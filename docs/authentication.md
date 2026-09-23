# Authentification — LIGAN+

Sprint 1 — ✅ Terminé.

## Fonctionnalités livrées (parcours par code à 6 chiffres)

- **Register** : envoie un **code de vérification à 6 chiffres** par email (valable 15 min,
  hashé SHA-256 en base, limité à 5 tentatives incorrectes) ;
- **Vérification** : l'utilisateur saisit le code sur une page dédiée → en cas de succès, il
  est **directement connecté** (cookies de session posés) — plus besoin de cliquer un lien ;
- **Renvoi de code** (`resend-code`, purpose `verify` | `reset`) avec compte à rebours côté front ;
- **Login / Logout** ;
- **JWT d'accès** (15 min, cookie HttpOnly `ligan_access`) + **refresh token opaque**
  (30 jours, cookie HttpOnly `ligan_refresh`, rotation à chaque usage, stocké hashé SHA-256) ;
- **Mot de passe oublié** : email → **code à 6 chiffres** → validation du code
  (`verify-reset-code`) → création du nouveau mot de passe (révoque toutes les sessions) ;
- **Rôles** : `CUSTOMER`, `PROFESSIONAL`, `ADMIN` ;
- Middlewares `requireAuth`, `requireRole(...)` ;
- Emails transactionnels au nom de **LIGAN+**, HTML responsive (table + styles inline,
  préheader, code affiché en "cases" distinctes, texte brut associé) via SMTP Brevo ;
- Validation **Zod** (body), messages clairs renvoyés sous
  `{ success: false, message, errors }` ;
- **Rate limiting** (`/register` 30/15 min, `/login` 10/15 min, mot de passe 5/h, codes 20/15 min) ;
- **Sanitation NoSQL** (`mongo-sanitize` sur le body) + Helmet + CORS credentials + `trust proxy`.

## Sécurité

- Mots de passe hashés **bcrypt (coût 12)**. Jamais stockés en clair ;
- `passwordHash`, codes et secrets **jamais exposés** dans les réponses API ;
- **Codes à 6 chiffres stockés en hash SHA-256 uniquement** ; **invalidés après
  5 tentatives incorrectes** et expirant au bout de 15 min ;
- Refresh tokens stockés **en hash SHA-256** uniquement (max 5 par utilisateur, rotation) ;
- Réponses `forgot-password` / `resend-code` neutres (pas de fuite d'existence de compte) ;
- Cookies `HttpOnly` + `SameSite=Lax` (dev) / `SameSite=None; Secure` (prod).

## Logs (console du serveur)

- `[INFO] Démarrage de LIGAN+ API (environnement : …)`
- `[INFO] MongoDB connecté.`
- `[INFO] Brevo API prête (SMTP …)` ou mode DEV (emails logués en console)
- `[INFO] Email envoyé à x@y : …` / `[INFO] (DEV) Email « … » à destination de x@y` + contenu
- `[INFO] Compte créé pour …, en attente de vérification`
- `[INFO] Email vérifié et session ouverte pour …`
- `[INFO] Connexion réussie pour …` / `[INFO] Déconnexion de …`
- `[INFO] Code de réinitialisation envoyé à …` / `[INFO] Mot de passe réinitialisé pour …`
- `[WARN] Code invalidé après 5 tentatives incorrectes pour …` / `[WARN] MongoDB déconnecté.`

## Tests manuels (spec Sprint 1) — tous passés

| Cas | Résultat |
| --- | --- |
| Inscription valide → 201, `isVerified: false` + email (code 6 chiffres) généré | ✅ |
| Email déjà utilisé → 409 | ✅ |
| Code incorrect → 400 ; 5 échecs → code invalidé | ✅ |
| Code correct → 200, `isVerified: true` + connexion automatique (cookies) | ✅ |
| Login avant vérification email → 403 | ✅ |
| Login valide → cookies HttpOnly + `/me` → 200 | ✅ |
| Refresh (rotation) → nouveau refresh, sessions conservées | ✅ |
| Logout → refresh révoqué, `/me` → 401 | ✅ |
| Forgot → réponse neutre + code reset généré | ✅ |
| Vérification du code reset → 200 | ✅ |
| Reset valide → nouveau mdp ; ancien mdp → 401 ; nouveau → 200 | ✅ |
| `/me` sans session → 401 ; mongo-sanitize actif | ✅ |

## Fichiers principaux

- `src/models/User.ts` — modèle (codes + tentatives) + `toPublicUser` (jamais d'infos sensibles)
- `src/middlewares/auth.ts` — `requireAuth`, `requireRole(...)`, noms des cookies
- `src/middlewares/validate.ts` — validation Zod → `AppError(400, errors)`
- `src/modules/auth/{validator,controller,routes}.ts` — schémas + logique + routage
- `src/services/email.ts` — transport SMTP Brevo + templates responsive + repli DEV
- `src/utils/tokens.ts` — JWT accès, refresh opaque, code 6 chiffres, hash SHA-256
- `src/utils/logger.ts` — logs horodatés `[INFO]` / `[WARN]` / `[ERROR]`

## Repli DEV

Sans SMTP (`EMAIL_USER`/`EMAIL_PASS` vides) ou avec `EMAIL_DISABLED=1`, les emails ne partent
pas : une ligne `(DEV) Email « … » à destination de …` + le texte (avec le code à 6 chiffres)
sont logués dans la console du serveur.