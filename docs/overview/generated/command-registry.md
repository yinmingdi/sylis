# Command Registry

Generated from the target repository's root package manifest. A listed command is discoverable, not automatically proven healthy.

| Script | Command |
| --- | --- |
| `ai:deepseek:activate-local` | `pnpm --filter @sylis/agent-api runtime:activate:deepseek:local` |
| `ai:deepseek:route:publish-local` | `pnpm --filter @sylis/model-gateway route:publish:deepseek:local` |
| `ai:smoke:deepseek` | `pnpm --filter @sylis/model-gateway provider:smoke:deepseek` |
| `api-contracts:breaking` | `node tools/architecture/check-api-contracts.mjs` |
| `api-contracts:check` | `node tools/architecture/check-api-contracts.mjs --generate` |
| `api-contracts:generate` | `turbo run build --filter=@sylis/api^... --filter=@sylis/admin-api^... --filter=@sylis/agent-api^... && pnpm --filter @sylis/api openapi:generate && pnpm --filter @sylis/admin-api openapi:generate && pnpm --filter @sylis/agent-api openapi:generate && prettier --write apps/backends/*/openapi/*.openapi.json && pnpm api-operations:generate && pnpm --filter @sylis/api-client generate && prettier --write packages/api-client/src/*/generated/schema.ts` |
| `api-operations:check` | `pnpm --filter @sylis/test-support build && pnpm --filter @sylis/test-support openapi-coverage:check` |
| `api-operations:generate` | `pnpm --filter @sylis/test-support build && pnpm --filter @sylis/test-support openapi-coverage:write` |
| `architecture:check` | `node tools/architecture/check-workspace.mjs` |
| `artifact:validate` | `node tools/architecture/validate-artifact-contract.mjs` |
| `build` | `turbo run build docs:build` |
| `build:api` | `pnpm --filter ./apps/backends/api run build` |
| `build:components` | `pnpm --filter ./docs/components run docs:build` |
| `build:docs` | `pnpm --filter ./docs/overview run docs:build` |
| `build:web` | `pnpm --filter ./apps/frontends/web run build` |
| `ci:affected` | `turbo run lint typecheck test build docs:build --affected --concurrency=50%` |
| `ci:full` | `turbo run lint typecheck test build docs:build --concurrency=50%` |
| `clean` | `pnpm -r exec rm -rf node_modules dist .next .turbo && rm -rf node_modules` |
| `clean:cache` | `pnpm store prune && pnpm -r exec rm -rf .turbo` |
| `commit` | `cz` |
| `coverage:reconcile` | `pnpm e2e:reconcile` |
| `db:generate` | `pnpm --filter @sylis/database prisma:generate` |
| `db:install` | `pnpm --filter @sylis/database... build && pnpm --filter @sylis/database database:install` |
| `db:studio` | `pnpm --filter @sylis/database prisma:studio` |
| `dev` | `./scripts/start-dev.sh` |
| `dev:api` | `pnpm --filter ./apps/backends/api run dev` |
| `dev:web` | `pnpm --filter ./apps/frontends/web run dev` |
| `docs` | `./scripts/start-docs.sh` |
| `docs:check` | `node tools/architecture/check-docs.mjs` |
| `e2e` | `pnpm e2e:full` |
| `e2e:api` | `tsx tests/e2e/run.ts --run=api` |
| `e2e:browser-quality` | `tsx tests/e2e/run.ts --run=browser-quality` |
| `e2e:core` | `tsx tests/e2e/run.ts --run=core` |
| `e2e:coverage-evidence` | `tsx tests/e2e/run-coverage-evidence.ts` |
| `e2e:deployment` | `playwright test --config tests/deployment/playwright.config.ts` |
| `e2e:full` | `tsx tests/e2e/run.ts --run=full` |
| `e2e:plan` | `pnpm --filter @sylis/test-support build && tsx tests/e2e/plan.ts` |
| `e2e:prepare` | `turbo run build --filter=@sylis/api-client --filter=@sylis/database --filter=@sylis/job-runtime --filter=@sylis/test-support` |
| `e2e:project` | `tsx tests/e2e/run.ts` |
| `e2e:reconcile` | `pnpm --filter @sylis/test-support coverage-reconcile` |
| `e2e:system` | `tsx tests/e2e/run.ts --run=system` |
| `e2e:typecheck` | `turbo run build --filter=@sylis/api-client... --filter=@sylis/job-runtime... --filter=@sylis/test-support && tsc --noEmit --project tests/e2e/tsconfig.json && tsc --noEmit --project tests/deployment/tsconfig.json` |
| `format` | `prettier --write .` |
| `format:check` | `prettier --check .` |
| `harness:check` | `pnpm --filter @sylis/engineering-harness run check -- --target ../..` |
| `harness:init` | `pnpm --filter @sylis/engineering-harness run init -- --target ../..` |
| `harness:test` | `pnpm --filter @sylis/engineering-harness test` |
| `learner:legacy-parity` | `node tools/architecture/check-legacy-learner.mjs` |
| `lexicon:check` | `turbo run lint typecheck test build --filter=@sylis/lexicon-artifact --filter=@sylis/lexicon-compiler --filter=@sylis/lexicon-builder --filter=@sylis/lexicon-publisher --concurrency=50% && node --test tools/lexicon/run-protected-pilot.test.mjs` |
| `lexicon:pilot` | `node tools/lexicon/run-protected-pilot.mjs` |
| `lexicon:pilot:prepare` | `node tools/lexicon/prepare-pilot-manifest.mjs` |
| `lint` | `turbo run lint` |
| `lint:fix` | `eslint . --fix` |
| `ops` | `node tools/operations/cli.mjs` |
| `prepare` | `husky install` |
| `secrets:check` | `node tools/architecture/check-secrets.mjs` |
| `start` | `./scripts/start-all.sh` |
| `test` | `turbo run test` |
| `test-coverage:check` | `pnpm --filter @sylis/test-support build && pnpm --filter @sylis/test-support coverage-manifest:check` |
| `test-coverage:generate` | `pnpm --filter @sylis/test-support build && pnpm --filter @sylis/test-support coverage-manifest:write` |
| `test:coverage` | `vitest run --config packages/agent-contracts/vitest.coverage.config.ts --coverage` |
| `test:e2e` | `turbo run e2e` |
| `test:mutation` | `stryker run stryker.config.mjs` |
| `turbo:graph` | `turbo run build --graph=.turbo/task-graph.html` |
| `typecheck` | `turbo run typecheck` |
| `workflows:check` | `node tools/architecture/check-workflows.mjs` |

Run the repository's documented install command before invoking commands that require dependencies.
