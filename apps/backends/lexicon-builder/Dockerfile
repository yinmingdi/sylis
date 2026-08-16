FROM node:24.19.0-bookworm-slim AS build
WORKDIR /workspace
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --frozen-lockfile
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm --filter @sylis/lexicon-builder... build
RUN pnpm --filter @sylis/lexicon-builder deploy --prod --legacy /prod/lexicon-builder
RUN cd /prod/lexicon-builder/node_modules/@sylis/database \
    && ./node_modules/.bin/prisma generate --schema ./prisma/schema

FROM node:24.19.0-bookworm-slim
WORKDIR /app
ARG SYLIS_RELEASE_VERSION=0.0.1
ARG SYLIS_COMMIT_SHA=WORKTREE
ENV NODE_ENV=production
ENV SYLIS_RELEASE_VERSION=$SYLIS_RELEASE_VERSION
ENV SYLIS_COMMIT_SHA=$SYLIS_COMMIT_SHA
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /data/lexicon-builder && chown -R node:node /data/lexicon-builder
COPY --chown=node:node --from=build /prod/lexicon-builder ./
USER node
EXPOSE 3800
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=6 CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||'3800')+'/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
