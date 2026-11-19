# 🚀 Déploiement du backend LIGAN+ — de A à Z

> Procédure **reproductible**, de la préparation du poste jusqu'à la publication sur Docker Hub.
> Tout a été exécuté et validé le 17–18/11/2026 sur cette machine.
>
> Valeurs réelles utilisées :
> - Distro WSL : **Ubuntu 26.04** (user `dupont`, systemd actif)
> - Moteur : **Docker 29.1.3**, **Compose 2.40.3**
> - Projet : `/mnt/c/Users/Vokoob/Desktop/Ligan+/backend`
> - Compte Docker Hub : **`dupont1`**
> - Image : `ligan-backend:latest` → `dupont1/ligan-backend:latest`
> - Digest final : `sha256:6c652f66ebb68ee2cb0d0b3a0adf0cc979e688d1cb27e14c746c1823ba0c59c9`

---

## 0. Le parcours en 6 phases

```
[1] Préparer le poste (disque + WSL)
        ↓
[2] Installer Docker Engine dans WSL Ubuntu
        ↓
[3] Comprendre les 3 fichiers Docker du projet
        ↓
[4] Construire + lancer en local  →  /api/health ✅
        ↓
[5] Publier sur Docker Hub (login → tag → push)
        ↓
[6] Récupérer depuis le Hub (pull → run) ✅
```

---

## Phase 1 — Préparer le poste

### 1.1 Vérifier l'espace disque (cause n°1 des blocages sur cette machine)

```powershell
Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object @{n='FreeGB';e={[math]::Round($_.FreeSpace/1GB,1)}}
```

⚠️ Il faut **> 10 Go libres** sur `C:`. Quand il n'en restait que 3 Go, la base interne de Docker Desktop (`boltdb`) ne pouvait plus s'ouvrir → moteur bloqué sur « Starting the Docker Engine… ».

### 1.2 Ouvrir le terminal WSL

```powershell
wsl -d Ubuntu
```

Vérifie l'état :
```bash
head -2 /etc/os-release          # Ubuntu 26.04
systemctl is-system-running      # running (systemd actif)
whoami                           # dupont
```

### 1.3 (Si Docker Desktop est encore utilisé) l'arrêter

```powershell
cd "C:\Users\Vokoob\Desktop\Ligan+\backend"
docker compose down
```

> Le moteur WSL et celui de Docker Desktop sont **indépendants** : ils ne partagent ni images ni conteneurs, et se disputent le port 5000. On n'en garde qu'un.

---

## Phase 2 — Installer Docker Engine dans WSL (sans Docker Desktop)

### 2.1 Installer

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2
```

### 2.2 Démarrer et activer au boot

```bash
sudo systemctl enable --now docker
sudo systemctl status docker --no-pager
```

Attendu : `Active: active (running)`. Le `enable` garantit que le moteur redémarre **tout seul** à chaque ouverture de WSL.

### 2.3 Corriger le chemin de `docker`

```bash
hash -r
which docker
```

⚠️ Doit afficher **`/usr/bin/docker`**. Si tu vois `/mnt/c/Program Files/Docker/...`, c'est le shim de Docker Desktop :
```bash
export PATH="/usr/bin:/usr/local/bin:$PATH"
hash -r
```

### 2.4 Droits utilisateur

```bash
newgrp docker
docker ps        # doit répondre sans "permission denied"
```

> L'utilisateur `dupont` est déjà membre du groupe `docker` sur cette machine.

### 2.5 Vérifier le moteur et le réseau

```bash
docker --version           # Docker version 29.1.3
docker compose version     # Docker Compose version 2.40.3
docker run --rm hello-world
```

Le `hello-world` valide le **pull depuis Docker Hub** (DNS / réseau). ✅

---

## Phase 3 — Comprendre les 3 fichiers du projet

### 3.1 `Dockerfile` — la recette de l'image

| Ligne | Rôle | Point à expliquer |
|---|---|---|
| `FROM node:20-slim` | Image de base Debian + Node 20 | **Pas d'Alpine** : musl ne gère pas `use-vc` (DNS TCP) requis pour MongoDB Atlas |
| `WORKDIR /app` | Dossier de travail | |
| `COPY package.json package-lock.json ./` | Manifestes d'abord | **Cache Docker** : si seul le code change, `npm ci` n'est pas rejoué |
| `RUN npm ci --no-audit --no-fund` | Installation déterministe | Versions figées par le lockfile |
| `COPY tsconfig.json ./` + `COPY src ./src` | Code source | |
| `RUN npm run build && npm prune --omit=dev && npm cache clean --force` | Compilation TS + nettoyage | Node pas nécessaire sur le poste ; image allégée |
| `ENV NODE_ENV=production` | Mode runtime | |
| `RUN mkdir -p /app/uploads && chown -R node:node /app` | Préparation droits | |
| `USER node` | Exécution **non-root** | Bonne pratique de sécurité |
| `EXPOSE 5000` | Documente le port | |
| `HEALTHCHECK ... fetch /api/health` | Test de santé automatique | `healthy` / `unhealthy` |
| `CMD ["node", "dist/server.js"]` | Un seul processus au premier plan | |

### 3.2 `docker-compose.yml` — la fiche de lancement

```yaml
services:
  api:
    build: .                         # construit depuis le Dockerfile
    image: ligan-backend:latest
    container_name: ligan-backend
    env_file: [.env]                 # secrets injectés au démarrage
    ports: ["5000:5000"]             # machine:conteneur
    dns: [1.1.1.1, 1.0.0.1]          # DNS Cloudflare
    dns_opt: [use-vc]                # DNS en TCP (contourne UDP abîmé)
    volumes: [uploads:/app/uploads]  # photos persistantes
    restart: unless-stopped
volumes:
  uploads:
```

### 3.3 `.dockerignore` — ce qui n'entre **pas** dans l'image

```
node_modules   # réinstallé dans l'image
dist           # recompilé dans l'image
.env           # ⛔ SECRET : jamais dans l'image
.env.*
.git
uploads
*.md
```

> 🎯 **Deux conséquences importantes :**
> 1. Le contexte de build ne fait que **365 ko** → pas besoin de copier le projet dans `~/`, on build directement depuis `/mnt/c`.
> 2. L'image poussée sur Docker Hub **ne contient aucun secret**.

---

## Phase 4 — Construire et lancer en local

### 4.1 Se placer dans le projet

```bash
cd "/mnt/c/Users/Vokoob/Desktop/Ligan+/backend"
ls -a        # vérifier la présence de .env
```

> ❌ **Ne pas faire** `cp -r ... ~/ligan-backend` : ça copie `node_modules` (des milliers de fichiers) à travers `/mnt/c` et ça ne finit jamais.

### 4.2 Build + lancement

```bash
docker compose up -d --build
```

⏳ Durée réelle observée : **~12 min** (le `chown -R /app` a pris ~8 min sur ce poste). Étapes du build :
```
FROM node:20-slim → WORKDIR → COPY package*.json → npm ci
→ COPY tsconfig + src → npm run build + npm prune
→ mkdir/chown → USER node → HEALTHCHECK → CMD
→ exporting to image → naming to ligan-backend:latest
```

Résultat :
```
✔ api Built
✔ Network backend_default Created
✔ Volume backend_uploads Created
✔ Container ligan-backend Started
```

### 4.3 Vérifier

```bash
docker compose ps
curl http://localhost:5000/api/health
```

Attendu :
```
ligan-backend   Up (healthy)   0.0.0.0:5000->5000/tcp
```
```json
{"success":true,"data":{"app":"LIGAN+","status":"ok","env":"development",
 "db":{"connected":true,"state":"connected"}}}
```

### 4.4 observer / arrêter

```bash
docker logs -f ligan-backend           # Ctrl+C pour quitter
docker stats ligan-backend --no-stream
docker compose down                    # arrêter
docker compose up -d                   # relancer (sans rebuild)
```

---

## Phase 5 — Publier sur Docker Hub

### 5.1 Créer le dépôt (navigateur)

1. **https://hub.docker.com/signup** → créer le compte `dupont1`, confirmer l'email.
2. **Repositories → Create repository** :
   - Namespace : `dupont1`
   - Name : `ligan-backend`
   - Visibility : **Public** (recommandé pour une soutenance)

> ⚠️ Sans dépôt existant, le push échoue avec `denied: requested access to the resource is denied`.

### 5.2 Générer un Access Token avec droit **Write**

1. Avatar → **Account settings** → **Security** → **Access tokens** → **Generate new token**
2. Name : `wsl-ligan-push`
3. Scopes : cocher **Read + Write** (et **Delete** si proposé)
   - ❌ Ne pas choisir « Read only » → erreur `access token has insufficient scopes`
4. Copier le token `dckr_pat_...` (affiché **une seule fois**).

### 5.3 Se connecter

Docker 29 propose par défaut une connexion web à base de code device :

```bash
docker login
```
```
USING WEB-BASED LOGIN
Your one-time device confirmation code is: XXXX-XXXX
Press ENTER to open your browser or submit your device code here:
https://login.docker.com/activate
```

→ Va sur **https://login.docker.com/activate**, entre le code, autorise. Le terminal affiche `Login Succeeded`.

**Méthode alternative (si le web traîne) :**
```bash
docker login -u dupont1
# Password: <token dckr_pat_... avec droit Write>
```

### 5.4 Tagger l'image

```bash
docker tag ligan-backend:latest dupont1/ligan-backend:latest
docker images | grep ligan-backend
```

Attendu — **même IMAGE ID** (le tag est un alias, rien n'est recopié) :
```
dupont1/ligan-backend:latest   6c652f66ebb6   503MB
ligan-backend:latest           6c652f66ebb6   503MB
```

### 5.5 Pousser

```bash
docker push dupont1/ligan-backend:latest
```

Attendu :
```
The push refers to repository [docker.io/dupont1/ligan-backend]
804d4d68057c: Pushed
... (13 couches)
latest: digest: sha256:6c652f66ebb68ee2cb0d0b3a0adf0cc979e688d1cb27e14c746c1823ba0c59c9 size: 856
```

⏳ Quelques minutes. Le **digest commence comme l'IMAGE ID** → preuve que le registre a la même image.

### 5.6 Vérifier sur le site

**https://hub.docker.com/r/dupont1/ligan-backend** → onglet **Tags** → `latest`, « Updated just now », ~503 MB. ✅

---

## Phase 6 — Récupérer depuis le Hub (preuve finale)

```bash
# 1. Supprimer l'image locale + arrêter le conteneur
docker compose down
docker rmi dupont1/ligan-backend:latest ligan-backend:latest

# 2. Télécharger depuis Docker Hub
docker pull dupont1/ligan-backend:latest

# 3. Lancer l'image téléchargée avec les secrets injectés
docker run -d --name ligan-backend \
  -p 5000:5000 \
  --env-file "/mnt/c/Users/Vokoob/Desktop/Ligan+/backend/.env" \
  dupont1/ligan-backend:latest

# 4. Vérifier
curl http://localhost:5000/api/health
```

Résultat identique : `db.connected: true`. ✅

> Le `.env` n'est **pas** dans l'image : il est fourni au runtime via `--env-file`. Ça veut dire que l'image publique est **sûre à partager**.

---

## Dépannage complet

| Symptôme | Cause | Solution |
|---|---|---|
| « Starting the Docker Engine… » bloqué | `C:` plein (3 Go) | Libérer > 10 Go puis relancer |
| `Unit docker.service could not be found` | Docker pas encore installé | `sudo apt install docker.io docker-compose-v2` |
| `which docker` → `/mnt/c/...` | Shim Docker Desktop | `export PATH="/usr/bin:$PATH"; hash -r` |
| `permission denied` sur `docker.sock` | Groupe `docker` | `newgrp docker` / rouvrir le terminal |
| `cp -r` ne finit jamais | `node_modules` copié via `/mnt/c` | Annuler (`Ctrl+C`), build directement depuis `/mnt/c` |
| `no such host` au pull | DNS | `cat /etc/resolv.conf`, `nslookup registry-1.docker.io` |
| `EAI_AGAIN` / `querySrv EBADRESP` (Mongo) | DNS UDP | `dns_opt: [use-vc]` dans compose |
| `access token has insufficient scopes` | Token en lecture seule | Nouveau token **Read + Write**, `docker logout`, `docker login` |
| `denied: requested access...` | Dépôt Hub inexistant ou mauvais pseudo | Créer le dépôt, vérifier le tag `<pseudo>/...` |
| `port 5000 already in use` | Deux moteurs actifs | `docker compose down` sur l'autre moteur |
| Build très long | `chown -R /app` sur `/mnt/c` | Normal ici (~8 min), patienter |

---

## Aide-mémoire final

```bash
# --- Quotidien (WSL) ---
wsl -d Ubuntu
cd "/mnt/c/Users/Vokoob/Desktop/Ligan+/backend"
docker compose up -d
docker compose ps
curl http://localhost:5000/api/health
docker compose down

# --- Registry (une fois) ---
docker login
docker tag ligan-backend:latest dupont1/ligan-backend:latest
docker push dupont1/ligan-backend:latest

# --- Depuis une machine vierge ---
docker pull dupont1/ligan-backend:latest
docker run -d -p 5000:5000 --env-file .env dupont1/ligan-backend:latest

# --- Nettoyage ---
docker logout
```

---

## Timing conseillé pour la soutenance (~12 min)

| Durée | Contenu |
|---|---|
| 1 min | Pourquoi Docker (reproductibilité, isolation) |
| 1 min | Architecture + les 3 fichiers |
| 2 min | Préparation WSL / installation du moteur |
| 3 min | Build + run + `/api/health` (image déjà construite → instantané) |
| 2 min | Tag + push + page Docker Hub |
| 2 min | Pull + run depuis le Hub + bénéfices |
| 1 min | Questions / marge |

> 💡 **Astuce** : refais le `docker pull` et le `docker run` juste avant de présenter (ou garde l'image en cache) pour ne pas dépendre du réseau le jour J.
