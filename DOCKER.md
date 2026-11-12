# 🐳 Dockeriser le backend LIGAN+ — guide pas à pas

Ce guide explique comment construire et lancer le backend dans un conteneur Docker,
et comment régler les problèmes rencontrés sur **ta** machine (connexion PdaNet + DNS bloqué).

> ✅ **État actuel** : l'image `ligan-backend:latest` est construite et le conteneur
> tourne (`docker ps` → *healthy*, MongoDB connecté, `http://localhost:5000/api/health` OK).

---

## 0. Vocabulaire (2 minutes)

| Terme | Définition simple |
|---|---|
| **Image** | Un « modèle » figé (comme un ISO de CD). Ex : `node:20-slim`. |
| **Conteneur** | Une instance *en cours d'exécution* d'une image. |
| **Dockerfile** | La « recette » qui décrit comment construire l'image. |
| **Volume** | Un dossier stocké *hors* du conteneur pour garder les données. |
| **Port** | Le conteneur a ses propres ports ; on les « publie » (`-p 5000:5000`). |

---

## 1. Démarrer Docker Desktop

- Ouvre **Docker Desktop** (icône baleine).
- Attends que l'indicateur passe au **vert** (« Engine running »).
- Vérifie :

```powershell
docker ps
```

Un tableau vide = OK. Si tu vois `500 Internal Server Error`, attends 1–2 min.

> 💡 Active **Settings → General → Start Docker Desktop when you sign in**.

---

## 2. Régler le DNS (⚠️ indispensable sur ta connexion)

Ta connexion (PdaNet) utilise `8.8.8.8` qui **ne résout rien**, et elle **altère les
réponses DNS en UDP**. Deux réglages sont donc nécessaires.

### 2.a — DNS du VM Docker (pour télécharger les images)

```powershell
wsl -d docker-desktop -u root -e sh -c "printf 'nameserver 1.1.1.1\nnameserver 1.0.0.1\n' > /etc/resolv.conf"
```

> ⚠️ Ce réglage est **réinitialisé** quand Docker Desktop redémarre complètement.
> À refaire dans ce cas (le VM remet `nameserver 172.20.144.1`).

### 2.b — DNS en **TCP** pour les conteneurs (pour MongoDB Atlas)

Comme les réponses UDP sont abîmées, on force le DNS en **TCP** via l'option
`use-vc`. C'est déjà configuré dans `docker-compose.yml` (`dns_opt: [use-vc]`)
et dans les commandes `docker run` ci-dessous.

> ❌ **Ne pas** mettre `"dns"` dans `C:\Users\Vokoob\.docker\daemon.json` :
> cela a **bloqué le moteur Docker** sur ta machine.

### Vérifier

```powershell
docker pull hello-world
```

`Status: Downloaded newer image...` = OK ✅

---

## 3. Construire l'image

```powershell
cd "C:\Users\Vokoob\Desktop\Ligan+\backend"
docker build -t ligan-backend:latest .
```

- **1ʳᵉ fois** : 10–20 min (téléchargement + `npm ci`). Sois patient.
- Ensuite : Docker réutilise le **cache**, c'est bien plus rapide.

> L'image de base est `node:20-slim` (Debian/glibc) et **non** `alpine` :
> le résolveur musl d'Alpine ne gère pas l'option `use-vc`, ce qui empêchait
> la connexion à MongoDB Atlas (`EAI_AGAIN`).

Vérifier :

```powershell
docker images ligan-backend
```

---

## 4. Lancer le conteneur

### Option A — `docker compose` (recommandé)

Assure-toi d'avoir un `.env` dans `backend/` (copie de `.env.example`).

```powershell
cd "C:\Users\Vokoob\Desktop\Ligan+\backend"
docker compose up -d
```

### Option B — `docker run`

```powershell
docker run -d `
  --name ligan-backend `
  --env-file .env `
  -p 5000:5000 `
  --dns 1.1.1.1 --dns 1.0.0.1 --dns-opt use-vc `
  -v ligan-uploads:/app/uploads `
  ligan-backend:latest
```

---

## 5. Vérifier que l'API répond

```powershell
curl http://localhost:5000/api/health
```

Attendu :

```json
{ "success": true, "data": { "app": "LIGAN+", "status": "ok",
  "db": { "connected": true, "state": "connected" } } }
```

Autres commandes utiles :

```powershell
docker ps                       # le conteneur tourne-t-il ? (healthy ?)
docker logs ligan-backend       # logs de l'application
docker stats ligan-backend      # CPU / RAM
```

---

## 6. Arrêter / repartir / reconstruire

```powershell
docker compose down             # arrête + supprime le conteneur
docker compose up -d            # relance
docker compose up -d --build    # reconstruit l'image puis relance (après modif du code)
```

---

## 7. Points de sécurité inclus dans le Dockerfile

- Utilisateur **non-root** `node`.
- **HEALTHCHECK** sur `/api/health`.
- `.env` **jamais** copié dans l'image (voir `.dockerignore`).
- Dépendances de dev supprimées après compilation (`npm prune --omit=dev`).

---

## 8. Dépannage rapide

| Symptôme | Cause probable | Solution |
|---|---|---|
| `lookup registry-1.docker.io: no such host` | DNS VM | Refaire l'étape 2.a |
| `500 Internal Server Error` sur `docker ps` | Moteur figé | Fermer Docker Desktop, `wsl --shutdown`, relancer |
| `querySrv EBADRESP` / `EAI_AGAIN` (MongoDB) | DNS UDP abîmé | Ajouter `--dns-opt use-vc` (étape 2.b) |
| `sh: tsc: not found` | `npm ci` incomplet | Rebuild (un seul `npm ci` dans le Dockerfile) |
| Port 5000 déjà utilisé | Autre process | `-p 5001:5000` |
| `MONGODB_URI absent` | `.env` non chargé | Vérifier `--env-file .env` / `env_file` |
