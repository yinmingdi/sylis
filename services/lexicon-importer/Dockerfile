FROM node:24.11.1-bookworm-slim AS build
WORKDIR /workspace
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --frozen-lockfile
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm --filter @sylis/lexicon-importer... build
RUN pnpm --filter @sylis/lexicon-importer deploy --prod --legacy /prod/importer
RUN cd /prod/importer/node_modules/@sylis/database \
    && ./node_modules/.bin/prisma generate --schema ./prisma/schema

FROM node:24.11.1-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /prod/importer ./
EXPOSE 3003
CMD ["node", "dist/main.js", "run"]
