# Command Registry

Generated from the target repository's root package manifest. A listed command is discoverable, not automatically proven healthy.

| Script | Command |
| --- | --- |
| `api-contracts:breaking` | `node tools/architecture/check-api-contracts.mjs` |
| `api-contracts:check` | `pnpm api-contracts:generate && node tools/architecture/check-api-contracts.mjs --clean` |
| `api-contracts:generate` | `turbo run build --filter=@sylis/database --filter=@sylis/background-jobs && pnpm --filter @sylis/api openapi:generate && pnpm --filter @sylis/api-client generate && pnpm --filter @sylis/admin-api-client generate && prettier --write apps/api/openapi/*.openapi.json apps/api/src/openapi/metadata.ts packages/api-client/src/generated/schema.ts packages/admin-api-client/src/generated/schema.ts` |
| `architecture:check` | `node tools/architecture/check-workspace.mjs` |
| `artifact:validate` | `node tools/architecture/validate-artifact-contract.mjs` |
| `build` | `turbo run build docs:build` |
| `build:api` | `pnpm --filter ./apps/api run build` |
| `build:components` | `pnpm --filter ./docs/components run docs:build` |
| `build:docs` | `pnpm --filter ./docs/overview run docs:build` |
| `build:web` | `pnpm --filter ./apps/web run build` |
| `ci:affected` | `turbo run lint typecheck test build docs:build --affected --concurrency=50%` |
| `ci:full` | `turbo run lint typecheck test build docs:build --concurrency=50%` |
| `clean` | `pnpm -r exec rm -rf node_modules dist .next .turbo && rm -rf node_modules` |
| `clean:cache` | `pnpm store prune && pnpm -r exec rm -rf .turbo` |
| `commit` | `cz` |
| `db:generate` | `pnpm --filter @sylis/database prisma:generate` |
| `db:migrate` | `pnpm --filter @sylis/database prisma:migrate` |
| `db:migrate:dev` | `pnpm --filter @sylis/database prisma:migrate:dev` |
| `db:studio` | `pnpm --filter @sylis/database prisma:studio` |
| `dev` | `./scripts/start-dev.sh` |
| `dev:api` | `pnpm --filter ./apps/api run dev` |
| `dev:web` | `pnpm --filter ./apps/web run dev` |
| `docs` | `./scripts/start-docs.sh` |
| `docs:check` | `node tools/architecture/check-docs.mjs` |
| `format` | `prettier --write .` |
| `format:check` | `prettier --check .` |
| `harness:check` | `pnpm --filter @sylis/harness run check -- --target ../..` |
| `harness:init` | `pnpm --filter @sylis/harness run init -- --target ../..` |
| `harness:test` | `pnpm --filter @sylis/harness test` |
| `lint` | `turbo run lint` |
| `lint:fix` | `eslint . --fix` |
| `ops` | `node tools/operations/cli.mjs` |
| `prepare` | `husky install` |
| `secrets:check` | `node tools/architecture/check-secrets.mjs` |
| `start` | `./scripts/start-all.sh` |
| `test` | `turbo run test` |
| `test:e2e` | `pnpm --filter ./apps/web run test:e2e --if-present` |
| `turbo:graph` | `turbo run build --graph=.turbo/task-graph.html` |
| `typecheck` | `turbo run typecheck` |
| `workflows:check` | `node tools/architecture/check-workflows.mjs` |

Run the repository's documented install command before invoking commands that require dependencies.
