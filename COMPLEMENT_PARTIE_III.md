# Complément au support « Partie III – Déployer une application avec Docker »

> Version **basique / à retenir** pour la soutenance. Terminal : **WSL Ubuntu** pour toutes les commandes `docker`.

---

## 7.2 Stratégie d'étiquetage (tags)

### À comprendre en 3 phrases
- Une image s'appelle `[registre/]utilisateur/dépôt:tag`.
- Le **tag** (`latest`, `v1.0.0`) est un **pointeur mobile** : on peut le déplacer.
- Le **digest** (`sha256:...`) identifie le **contenu exact** : il ne change **jamais**.

### Nos tags réels sur Docker Hub

| Tag | Date | Digest court | Remarque |
|---|---|---|---|
| `latest` | 19/11 | `6b2d4f93` | realigné sur la même image |
| `v1.0.0` | 19/11 | `6b2d4f93` | version sémantique |
| `sha-2013fa9` | 19/11 | `6b2d4f93` | trace vers le commit Git |

Digest complet : `sha256:6b2d4f93e19bd668d625b4ac3603e662285c3d0ea61576b9dac31e276fa09a78`.
(Ancien digest du 17/11 : `6c652f66...` — remplacé après reconstruction.)

> 💡 Pourquoi `v1.0.0` et `sha-2013fa9` ont un digest différent de `latest` ?
> Parce que l'image a été **reconstruite** le 19/11 : l'image de base `node:20-slim` avait été mise à jour entre-temps. C'est exactement pour ça qu'il faut **épingler la version de base** (`node:20.19.0-slim` au lieu de `node:20-slim`).

### Commandes (à recopier après une modification)

```bash
cd "/mnt/c/Users/Vokoob/Desktop/Ligan+/backend"

# 1. Reconstruire
docker compose up -d --build

# 2. Mettre plusieurs noms sur la MÊME image (aucune reconstruction)
docker tag ligan-backend:latest dupont1/ligan-backend:v1.0.0
docker tag ligan-backend:latest dupont1/ligan-backend:sha-2013fa9
docker tag ligan-backend:latest dupont1/ligan-backend:latest

# 3. Pousser
docker push dupont1/ligan-backend:v1.0.0
docker push dupont1/ligan-backend:sha-2013fa9
docker push dupont1/ligan-backend:latest

# 4. Vérifier le digest
docker image inspect dupont1/ligan-backend:v1.0.0 --format '{{.Id}}'
```

### Les 3 règles à réciter
1. **Ne jamais republier** un tag de version déjà diffusé (`v1.0.0` = immuable).
2. **Ne pas déployer `latest` en production** → déployer `v1.0.0`.
3. **Fixer la version de l'image de base** dans le `Dockerfile`.

**À dire :** « Une même image reçoit plusieurs tags sans être reconstruite. En production je déploie `v1.0.0`, et le digest `sha256:...` garantit le contenu exact. »

---

## 7.3 Sauvegarde, restauration et rollback

### Ce qu'on sauvegarde (et ce qu'on ne sauvegarde pas)
| Élément | Sauvegardé ? | Pourquoi |
|---|---|---|
| Conteneurs | ❌ | Jetables, recréés depuis l'image |
| **Volume `uploads`** (photos) | ✅ | Données non reconstruisibles |
| `docker-compose.yml` | ✅ | Versionné dans Git |
| Secrets `.env` | ✅ | **Jamais dans Git**, copiés hors du serveur |
| Base MongoDB | ✅ | **Backup assuré par MongoDB Atlas** (à vérifier dans le dashboard) |

### Commandes de sauvegarde / restauration

```bash
cd "/mnt/c/Users/Vokoob/Desktop/Ligan+/backend"

# Sauvegarder le volume des photos
docker run --rm -v backend_uploads:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads.tgz -C /data .

# Restaurer
docker run --rm -v backend_uploads:/data -v "$PWD":/backup alpine \
  tar xzf /backup/uploads.tgz -C /data

# Exporter / importer une image
docker save -o ligan-v1.0.0.tar dupont1/ligan-backend:v1.0.0
docker load -i ligan-v1.0.0.tar
```

### Rollback (retour à la version précédente)

```bash
# 1. Dans docker-compose.yml, remplacer l'image par l'ancien tag :
#    image: dupont1/ligan-backend:v1.0.0
# 2. Puis :
docker compose up -d
```

**Conditions du rollback :** l'ancienne image existe encore dans le registre, et la base reste compatible.

### Les 3 stratégies de déploiement
| Stratégie | Principe | Notre cas |
|---|---|---|
| **Recreate** | On arrête puis on redémarre (coupure brève) | ✅ C'est ce qu'on fait |
| **Rolling update** | Remplacement progressif, sans coupure | Swarm (voir ci-dessous) |
| **Blue/green** | Deux environnements, bascule instantanée | Non fait |

**À dire :** « Je sauvegarde ce qui ne peut pas être reconstruit : le volume des photos, la config versionnée et les secrets. Le conteneur lui-même est jetable. Pour revenir en arrière, je redéploie l'ancien tag. »

---

## 10 — Module minimal Docker Swarm

### à retenir en 5 lignes
- **Compose = 1 machine**. **Swarm = cluster** de plusieurs machines (nœuds).
- Un **manager** planifie, les **workers** exécutent les conteneurs.
- Nombre **impair de managers** (quorum Raft) : 3 tolèrent 1 panne.
- Ports à ouvrir : **2377** (gestion), **7946** (découverte), **4789** (overlay).
- Un **service** = définition ; une **tâche** = 1 conteneur. `replicas: 3` = 3 tâches.

### Démo locale minimale (une seule machine = 1 nœud manager)

Tout se passe dans le **terminal WSL Ubuntu** :

```bash
cd "/mnt/c/Users/Vokoob/Desktop/Ligan+/backend"

# 1. Créer le cluster (cette machine devient manager)
docker swarm init

# 2. Voir les nœuds
docker node ls

# 3. Déployer une "stack" avec 2 copies
docker stack deploy -c swarm-demo.yml demo

# 4. Observer
docker service ls
docker service ps demo_web
curl http://127.0.0.1:8081
# ⚠️ Sous WSL, utiliser 127.0.0.1 et non "localhost" :
# "localhost" essaie l'IPv6 (::1) alors que le routing mesh Swarm
# n'écoute qu'en IPv4 ici -> curl reste bloqué ("Operation timed out").

# 5. Mise à jour progressive (rolling update)
docker service update --image nginx:stable-alpine demo_web
# Ici on a utilisé : docker service update --force demo_web
# (même image, mais on voit le remplacement 1 par 1 dans "docker service ps").

# 6. Retour arrière
docker service rollback demo_web

# 7. Nettoyage
docker stack rm demo
docker swarm leave --force
```

Le fichier `swarm-demo.yml` contient :
```yaml
deploy:
  replicas: 2
  update_config:
    parallelism: 1      # 1 copie à la fois
    delay: 5s           # pause entre deux lots
    order: start-first  # nouvelle copie démarrée AVANT d'arrêter l'ancienne
    failure_action: rollback
```

### Différences Compose → Swarm (à connaître)
| Compose | Avec `docker stack deploy` |
|---|---|
| `build: .` | **Ignoré** → l'image doit être dans un registre |
| `depends_on` | **Ignoré** → les services doivent gérer la reconnexion |
| `restart`, `mem_limit` | Remplacés par `deploy.restart_policy`, `deploy.resources` |
| `.env` lu automatiquement | **Non lu** → variables exportées ou secrets |

### Conditions d'une mise à jour **sans coupure**
1. Au moins **2 copies**
2. Un **HEALTHCHECK** dans l'image (✅ on l'a)
3. `order: start-first`
4. Arrêt propre (`SIGTERM` géré)
5. Migrations de base compatibles

### Résultat réellement observé aujourd'hui

```
docker swarm init      -> node vt8npfqkssh7rgb1occb3mtp6, manager Leader, moteur 29.1.3
docker service ls      -> demo_web  replicated  2/2  nginx:alpine  *:8081->80/tcp
docker service ps      -> 2 tâches "Running" sur DESKTOP-89SLGLB
curl 127.0.0.1:8081    -> "Welcome to nginx!"
service update --force -> nouvelles tâches créées une par une (start-first), puis "converged"
service rollback       -> retour à la version précédente, "converged"
```

**À dire :** « Compose orchestrer sur une machine ; Swarm répartit les conteneurs sur un cluster, les redémarre en cas de panne et permet une mise à jour progressive sans interruption. »

---

## Récap final pour l'oral

| Section du cours | Couvert ? |
|---|---|
| 7.1 Cycle de déploiement | ✅ |
| 7.2 Étiquetage | ✅ **ajouté** |
| 7.3 Sauvegarde / rollback | ✅ **ajouté** |
| 8.1 Registres OCI | ✅ |
| 8.2 Publier sur Docker Hub | ✅ |
| 9.3 Piloter Compose | ✅ |
| 10 Swarm (module minimal) | ✅ **ajouté** |
| 8.3 Registre privé | ❌ (mention orale : Harbor / GHCR) |
| 9.1–9.2 Multi-tiers | ⚠️ (base externalisée chez MongoDB Atlas) |
