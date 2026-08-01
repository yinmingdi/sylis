FROM node:24-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.23.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/utils/package.json packages/utils/package.json
RUN pnpm install --frozen-lockfile --filter @sylis/web... --filter @sylis/utils

COPY apps/web apps/web
COPY packages/shared packages/shared
COPY packages/utils packages/utils
RUN pnpm --filter @sylis/utils build && pnpm --filter @sylis/web build

FROM caddy:2-alpine

COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
EXPOSE 8080
