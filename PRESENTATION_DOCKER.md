# 🎓 Présentation : déploiement du backend LIGAN+ avec Docker

> **Support pour la soutenance / démonstration à l'encadreur.**
> Objectif : montrer comment le backend (API REST) est *conteneurisé* et lancé
> de façon **reproductible**, avec la preuve que l'API et la base fonctionnent.

---

## 0. En une phrase (ce qu'on démontre)

> « Le backend LIGAN+ est une API Node.js/Express. Grâce à Docker, on l'emballe
> dans une **image** autonome et on le lance dans un **conteneur** isolé : il
> démarre à l'identique sur n'importe quelle machine, sans installer Node ni les
> dépendances sur le poste. »

**Ce que le jury verra :**
1. La **construction** d'une image Docker depuis le `Dockerfile`.
2. Le **lancement** du conteneur via `docker compose`.
3. La **preuve** que l'API répond et que la base MongoDB est connectée.
4. L'**arrêt** propre du conteneur.

---

## 1. Les concepts à expliquer (30 s chacun)

| Terme | Définition simple | Analogie |
|---|---|---|
| **Image** | Modèle figé, en lecture seule (code + runtime + dépendances). | Un « moule à gâteau ». |
| **Conteneur** | Instance en cours d'exécution d'une image. | Le gâteau démoulé. |
| **Dockerfile** | La « recette » qui décrit comment construire l'image. | La recette. |
| **Volume** | Dossier stocké **hors** du conteneur → les données survivent. | Un disque externe. |
| **Port** | Le conteneur a ses propres ports ; on les « publie ». | Une porte de service. |
| **Compose** | Fichier qui décrit *comment lancer* les conteneurs (réseau, DNS, volumes, ports). | La fiche de montage. |

> 🎯 **Idée clé à marteler** : *l'image est immuable, le conteneur est jetable.*
> On peut détruire/recréer le conteneur autant de fois qu'on veut, l'image et les
> données (volume, base) restent.

---

## 2. Architecture (schéma à montrer)

```
        Navigateur / Application mobile
                    │  HTTPS + JSON
                    ▼
     ┌─────────────────────────────────────┐
     │  Backend LIGAN+ (API REST)           │
     │  ┌───────────────────────────────┐   │
     │  │  CONTENEUR DOCKER             │   │
     │  │  Image : ligan-backend:latest │   │
     │  │  Node 20 + Express 5 (TS)     │   │
     │  │  port interne 5000            │   │
     │  └───────────────┬───────────────┘   │
     └──────────────────┼───────────────────┘
        port publié     │
        5000:5000       │
                        ▼
        ┌───────────────┼───────────────┬──────────────┐
        ▼               ▼               ▼              ▼
  MongoDB Atlas    Cloudinary       Brevo (email)   SebPay (paiement)
  (base de données) (photos)         (transactionnel) (abonnements)
```

> Les services externes sont **managés** (cloud). Le conteneur ne contient que
> l'application : il est léger et sans état (stateless).

---

## 3. Les fichiers à montrer dans le projet

### 3.1 `backend/Dockerfile` — la recette de l'image

```dockerfile
FROM node:20-slim                      # 1. image de base (Node 20, Debian)
WORKDIR /app                           # 2. dossier de travail dans le conteneur
COPY package.json package-lock.json ./ # 3. dépendances d'abord (cache Docker)
RUN npm ci --no-audit --no-fund        # 4. installation déterministe
COPY tsconfig.json ./                  # 5. config TypeScript
COPY src ./src                         # 6. code source
RUN npm run build \                    # 7. compilation TS -> dist/
  && npm prune --omit=dev \            #    + on retire les deps de dev (image plus légère)
  && npm cache clean --force
ENV NODE_ENV=production                # 8. mode production
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node                              # 9. SÉCURITÉ : on n'exécute PAS en root
EXPOSE 5000                            # 10. documente le port
HEALTHCHECK ... CMD node -e "fetch(.../api/health)..."  # 11. test de santé
CMD ["node", "dist/server.js"]         # 12. commande de démarrage
```

**Points à souligner :**
- **3–4** : on copie d'abord les manifestes → si seul le code change, Docker
  réutilise le cache et ne réinstalle pas les dépendances (build rapide).
- **7** : compilation TypeScript **dans** l'image → pas besoin de Node sur le poste.
- **9** : utilisateur **non-root** = bonne pratique de sécurité.
- **11** : Docker vérifie tout seul que l'API est vivante (`healthy`/`unhealthy`).
- **12** : le conteneur exécute **un seul** processus au premier plan.

> ⚠️ **Pourquoi `node:20-slim` et pas `alpine` ?** Alpine (musl) gère mal le DNS
> en TCP (`use-vc`) requis sur cette connexion → la connexion à MongoDB Atlas
> échouait (`EAI_AGAIN`). On est donc resté sur Debian (glibc).

### 3.2 `backend/docker-compose.yml` — comment on lance le conteneur

```yaml
services:
  api:
    build: .                        # construit l'image depuis le Dockerfile
    image: ligan-backend:latest
    container_name: ligan-backend
    env_file: [.env]                # variables (MONGODB_URI, JWT, Brevo…)
    ports: ["5000:5000"]            # port_machine:port_conteneur
    dns: [1.1.1.1, 1.0.0.1]         # DNS Cloudflare (contourne le DNS local bloqué)
    dns_opt: [use-vc]               # force le DNS en TCP (réponses UDP abîmées)
    volumes: [uploads:/app/uploads] # photos persistantes
    restart: unless-stopped         # redémarre auto (sauf arrêt manuel)
volumes:
  uploads:
```

### 3.3 `backend/.dockerignore` — ce qui n'entre **pas** dans l'image

```
node_modules   # réinstallés dans l'image
dist           # recompilé dans l'image
.env           # ⛔ SECRET : jamais dans une image !
.git
```

> 🎯 **Point de sécurité important** : le fichier `.env` (mots de passe, clés API)
> n'est **jamais** copié dans l'image. Il est injecté **au démarrage** via
> `env_file` → l'image peut être partagée sans exposer de secret.

---

## 4. La démonstration en direct (script pas à pas)

> ⏱️ **Astuce pro** : construis l'image **avant** la soutenance
> (`docker compose build`). Pendant la démo, tu ne fais que `up -d` → c'est
> quasi instantané et sans risque de dépasser le temps.

### Étape 1 — Vérifier que Docker tourne

```powershell
docker version
docker ps
```

**À dire :** « Docker Desktop est démarré, le moteur répond, et aucun conteneur
ne tourne encore. »

### Étape 2 — (Re)construire l'image

```powershell
cd "C:\Users\Vokoob\Desktop\Ligan+\backend"
docker compose build
```

**À dire :** « Docker lit le `Dockerfile`, part de l'image `node:20-slim`,
installe les dépendances, compile le TypeScript et produit une image
`ligan-backend:latest` autonome. »

Vérifier :

```powershell
docker images ligan-backend
```

### Étape 3 — Lancer le conteneur

```powershell
docker compose up -d
```

**À dire :** « Compose crée le réseau, monte le volume des photos, publie le port
5000 et démarre le conteneur en arrière-plan (`-d` = détaché). »

Attendu (extrait) :

```
 Container ligan-backend  Created
 Container ligan-backend  Started
```

### Étape 4 — Prouver que ça fonctionne ✅

```powershell
docker compose ps
```

→ `ligan-backend   Up (healthy)   0.0.0.0:5000->5000/tcp`

```powershell
curl http://localhost:5000/api/health
```

→

```json
{ "success": true, "data": { "app": "LIGAN+", "status": "ok",
  "db": { "connected": true, "state": "connected" } } }
```

**À dire :** « Le conteneur est *healthy* (le HEALTHCHECK du Dockerfile passe),
l'API répond sur le port publié, et la base MongoDB Atlas est connectée. »

Montrer les logs en direct :

```powershell
docker logs -f ligan-backend
```

*(puis `Ctrl+C` pour sortir — le conteneur continue de tourner.)*

Montrer la consommation :

```powershell
docker stats ligan-backend --no-stream
```

### Étape 5 — (Optionnel) Prouver l'isolation et la persistance

```powershell
docker exec -it ligan-backend sh -c "node -v && ls"
```

**À dire :** « On est *dans* le conteneur : Node 20 et le dossier `dist/` compilé.
C'est un environnement isolé du poste. »

```powershell
docker inspect --format '{{json .Mounts}}' ligan-backend
```

**À dire :** « Le dossier `/app/uploads` est un **volume** : les photos uploadées
survivent à la suppression du conteneur. »

### Étape 6 — Arrêt propre

```powershell
docker compose down
```

**À dire :** « On arrête et supprime le conteneur. L'image et le volume restent :
on peut tout relancer en une commande. »

---

## 5. Ce que ça apporte au projet (bénéfices à énoncer)

| Bénéfice | Concrètement |
|---|---|
| **Reproductibilité** | Même environnement partout (poste, serveur, CI). Fini le « ça marche chez moi ». |
| **Isolation** | Le conteneur n'installe rien sur la machine hôte. |
| **Portabilité** | L'image tourne sur Windows/WSL, Linux, cloud (Render, VPS…). |
| **Légèreté** | Dépendances de dev retirées (`npm prune`), image ~500 Mo. |
| **Sécurité** | Exécution non-root, `.env` jamais embarqué, surface minimale. |
| **Exploitabilité** | HEALTHCHECK automatique + `restart: unless-stopped`. |
| **Prêt pour la montée en charge** | Application *stateless* → on peut lancer plusieurs conteneurs derrière un load balancer. |

---

## 6. Questions probables du jury — réponses prêtes

**« Pourquoi Docker plutôt qu'installer Node directement ? »**
→ Reproductibilité et isolation : l'image embarque la bonne version de Node et
les dépendances exactes (`package-lock.json`). Le déploiement est identique
partout, sans « ça marche chez moi ».

**« Pourquoi l'image de base n'est pas `alpine` ? »**
→ Alpine utilise musl, dont le résolveur DNS ne gère pas l'option `use-vc`
(DNS en TCP) nécessaire sur notre connexion pour joindre MongoDB Atlas. On est
resté sur Debian (glibc).

**« Où sont stockées les données (photos) ? »**
→ Dans un **volume Docker** (`uploads`) monté sur `/app/uploads`. Elles ne
disparaissent pas si le conteneur est supprimé. En production à grande échelle,
on les déplacerait vers Cloudinary/S3 (multi-instances).

**« Comment gères-tu les secrets (mot de passe base, clés API) ? »**
→ Ils ne sont **pas** dans l'image (exclus par `.dockerignore`). Ils sont injectés
au démarrage via `env_file: .env` (ou des variables d'environnement du serveur).

**« Et si le conteneur plante ? »**
→ `restart: unless-stopped` le relance automatiquement, et le HEALTHCHECK
signale l'état (`healthy`/`unhealthy`) pour un monitoring.

**« Comment le mettre en production ? »**
→ Même image, poussée sur un registre (Docker Hub/GHCR), lancée sur un serveur
ou une plateforme (Render, VPS, Kubernetes). L'application étant *stateless*,
on peut multiplier les instances derrière un load balancer.

**« Quelle est la différence entre l'image et le conteneur ? »**
→ L'image est le modèle figé ; le conteneur est une instance en exécution.
On peut lancer plusieurs conteneurs depuis une seule image.

---

## 7. Dépannage pendant la démo (à connaître par cœur)

| Symptôme | Cause | Solution rapide |
|---|---|---|
| `docker ps` → `500 Internal Server Error` | Moteur Docker figé | Fermer Docker Desktop, `wsl --shutdown`, relancer |
| Écran « Starting the Docker Engine… » bloqué | **Disque `C:` plein** (base interne Docker) | Libérer de l'espace sur `C:` (garder > 10 Go), puis relancer |
| `lookup registry-1.docker.io: no such host` | DNS du VM Docker | `wsl -d docker-desktop sh -c "echo 'nameserver 1.1.1.1' > /etc/resolv.conf"` |
| `querySrv EBADRESP` / `EAI_AGAIN` (MongoDB) | Réponses DNS UDP abîmées | Vérifier `dns_opt: [use-vc]` dans compose, relancer |
| `MONGODB_URI absent` | `.env` non chargé | Vérifier `backend/.env` et `env_file` |
| Port 5000 déjà utilisé | Autre programme | `docker compose down` puis relancer |

> 💡 **Vérif disque avant la soutenance :**
> ```powershell
> Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object @{n='FreeGB';e={[math]::Round($_.FreeSpace/1GB,1)}}
> ```

---

## 8. Aide-mémoire : toutes les commandes

```powershell
# Se placer dans le dossier du backend
cd "C:\Users\Vokoob\Desktop\Ligan+\backend"

# Construire l'image
docker compose build

# Lancer (en arrière-plan)
docker compose up -d

# Vérifier
docker compose ps
curl http://localhost:5000/api/health

# Logs / ressources
docker logs -f ligan-backend
docker stats ligan-backend --no-stream

# Arrêter
docker compose down

# Reconstruire après une modification du code
docker compose up -d --build
```

---

## 9. Répartition du temps conseillée (≈ 10 min)

| Durée | Contenu |
|---|---|
| 1 min | Concepts : image / conteneur / Dockerfile |
| 1 min | Architecture (schéma) |
| 2 min | Les 3 fichiers : Dockerfile, compose, .dockerignore |
| 3 min | Démo en direct (build → up → health → logs → down) |
| 2 min | Bénéfices + questions |
| 1 min | Marge / imprévu |
