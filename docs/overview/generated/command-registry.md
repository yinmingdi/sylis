# Command Registry

Generated from the target repository's root package manifest. A listed command is discoverable, not automatically proven healthy.

| Script | Command |
| --- | --- |
| `build` | `pnpm run build:api && pnpm run build:web && pnpm run build:docs` |
| `build:api` | `pnpm --filter ./apps/api run build` |
| `build:components` | `pnpm --filter ./docs/components run build` |
| `build:docs` | `pnpm --filter ./docs/overview run docs:build` |
| `build:web` | `pnpm --filter ./apps/web run build` |
| `clean` | `pnpm -r exec rm -rf node_modules dist .next .turbo && rm -rf node_modules` |
| `clean:cache` | `pnpm store prune && pnpm -r exec rm -rf .turbo` |
| `commit` | `cz` |
| `db:generate` | `pnpm --filter ./apps/api run db:generate` |
| `db:migrate` | `pnpm --filter ./apps/api run db:migrate` |
| `db:push` | `pnpm --filter ./apps/api run db:push` |
| `db:reset` | `pnpm --filter ./apps/api run db:reset` |
| `db:seed` | `pnpm --filter ./apps/api run db:seed` |
| `db:studio` | `pnpm --filter ./apps/api run db:studio` |
| `dev` | `./scripts/start-dev.sh` |
| `dev:api` | `pnpm --filter ./apps/api run dev` |
| `dev:web` | `pnpm --filter ./apps/web run dev` |
| `docs` | `./scripts/start-docs.sh` |
| `format` | `prettier --write .` |
| `format:check` | `prettier --check .` |
| `harness:check` | `pnpm --filter @sylis/harness run check -- --target ../..` |
| `harness:init` | `pnpm --filter @sylis/harness run init -- --target ../..` |
| `harness:test` | `pnpm --filter @sylis/harness test` |
| `lint` | `pnpm --filter @sylis/api lint && pnpm --filter @sylis/web lint && eslint services/vocabulary-importer/src` |
| `lint:fix` | `eslint . --fix` |
| `prepare` | `husky install` |
| `start` | `./scripts/start-all.sh` |
| `test` | `pnpm -r run test --if-present` |
| `test:e2e` | `pnpm --filter ./apps/web run test:e2e --if-present` |
| `typecheck` | `pnpm -r run typecheck --if-present` |

Run the repository's documented install command before invoking commands that require dependencies.
