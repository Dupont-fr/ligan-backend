# =============================================================================
# Dockerfile du backend LIGAN+
# Image simple (une seule etape) : installe -> compile -> nettoie -> execute.
# Avantage : un seul "npm ci" (moins de memoire utilisee, build plus fiable).
# =============================================================================

# Image Node officielle basee Debian (glibc).
# Note : on n'utilise PAS "alpine" (musl) car son resolveur DNS ne gere pas
# l'option "use-vc" (DNS en TCP), indispensable sur cette connexion.
FROM node:20-slim

# Repertoire de travail DANS le conteneur.
WORKDIR /app

# On copie d'abord les manifestes de dependances.
# Astuce cache Docker : si le code change mais pas les dependances,
# l'installation n'est pas refaite -> builds plus rapides.
COPY package.json package-lock.json ./

# Installation deterministe depuis package-lock.json.
# Dev deps incluses (tsc en a besoin pour compiler).
# --no-audit / --no-fund : on saute les controles reseau inutiles.
RUN npm ci --no-audit --no-fund

# Puis le code source et la config TypeScript.
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript (tsconfig -> dossier "dist").
# Puis on supprime les devDependencies (npm prune) pour alleger l'image.
RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force

# Mode production.
ENV NODE_ENV=production

# Dossier des uploads (photos) + droits pour l'utilisateur non-root "node".
RUN mkdir -p /app/uploads && chown -R node:node /app

# Securite : on n'execute PAS le process en root (bonne pratique Docker).
USER node

# Documente le port expose (le conteneur ecoute sur 5000).
EXPOSE 5000

# Docker teste regulierement l'endpoint de sante pour savoir si le conteneur
# est "healthy". Si l'API ne repond pas, le statut passe a "unhealthy".
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Commande lancee au demarrage du conteneur.
CMD ["node", "dist/server.js"]
