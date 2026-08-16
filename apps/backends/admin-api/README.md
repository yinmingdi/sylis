# Sylis Admin API

NestJS control-plane API for the independent `ADMIN` session audience. It owns
Platform Operations orchestration and redacted projections, while Identity,
Agent, and Model mutations are delegated through typed owner-service clients.

Public browser routes live under `/api/admin/v1`. Deployment ingestion is a
separate service-authenticated internal route; the Admin browser projection is
read-only. Asset routes expose metadata and processing evidence only, never
object URLs or user content bodies.

```sh
pnpm --filter @sylis/admin-api build
pnpm --filter @sylis/admin-api openapi:generate
pnpm --filter @sylis/admin-api test
```

The generated OpenAPI snapshot is consumed by `@sylis/api-client/admin` and is
checked with the other User and Agent contracts before release.
