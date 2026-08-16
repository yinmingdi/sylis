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
RUN pnpm --filter @sylis/admin... build

FROM caddy:2.10.2-alpine
ARG SYLIS_RELEASE_VERSION=0.0.1
ARG SYLIS_COMMIT_SHA=WORKTREE
COPY apps/frontends/admin/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /workspace/apps/frontends/admin/dist /srv
RUN printf '{"status":"ready","service":"admin","version":"%s","commitSha":"%s"}\n' \
    "$SYLIS_RELEASE_VERSION" "$SYLIS_COMMIT_SHA" > /srv/version.json
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 CMD wget -q --spider http://127.0.0.1:8080/health || exit 1
