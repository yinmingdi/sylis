# Railway deployment

Sylis deploys twelve independently built application images:

- frontends: `web`, `admin`;
- synchronous backends: `api`, `admin-api`, `agent-api`, `model-gateway`;
- executors: `agent-executor`, `agent-evaluator`, `asset-processor`,
  `automation-executor`;
- lexicon data plane: `lexicon-builder`, `lexicon-publisher`.

GitHub Actions builds each image once from the exact protected `main` commit,
runs the same image set in E2E, pushes immutable GHCR digests, and deploys those
digests to staging. Railway does not rebuild the Git repository. A protected
manual `v0.0.1` release promotes the already validated digests to production;
production never rebuilds an application image.

Each image embeds the release version and exact commit SHA. Post-deploy checks
compare all twelve readiness identities with the immutable manifest. Web and
Admin expose `/version.json`; the public API reads private backend readiness
over Railway internal DNS, so executors and data-plane services do not need
public domains.

PostgreSQL, Redis, private object storage, ClamAV, and service-specific volumes
are managed runtime dependencies. Only `api` installs the database, using the
privileged `DATABASE_OWNER_URL` in Railway's pre-deploy command. Prisma
`db push --force-reset` creates the complete `0.0.1` schema; the installer then
applies `prisma/invariants.sql` for PostgreSQL constraints, triggers, functions,
roles, and grants that Prisma Schema cannot express. Neither step creates or
reads migration history.

Both `api` and `agent-api` receive Railway's private `REDIS_URL`. The API
outbox dispatcher publishes `AGENT_EVENT_AVAILABLE` wakeups, while Agent API
subscribes and drains the authoritative `AgentEvent` rows into Session SSE.
Redis never stores the event cursor, message delta, Run result, or Artifact;
losing a Pub/Sub notification is recovered from PostgreSQL, and losing the
Redis connection closes SSE so the browser reconnects with `Last-Event-ID`.

When all five `SYLIS_SYNTHETIC_*` values are configured, the installer also
creates the dedicated Learner/Support Operator and a static `sylis-en-zh`
deployment canary release containing the two standard senses of `bank`. The
canary is owned by the deployment test contract, uses no external provider or
AI, and exists only so a freshly reset environment can prove authenticated
Study and Lexicon reads. A real immutable lexicon artifact published and
activated through Builder -> Publisher replaces the canary active pointer.

There are no production users, so every `0.0.1` API deployment is intentionally
a destructive greenfield installation. It discards existing application data.
This deployment policy must be replaced before accepting persistent production
data; application services must never silently switch it to an incremental
schema workflow.

The authoritative setup, variable ownership, volume layout, release flow,
rollback procedure, and secret policy are maintained in:

- [CI/CD, Railway and secrets](docs/overview/refactor/delivery/cicd-security.md)
- [Runtime configuration](docs/overview/guide/configuration.md)
- [Operations CLI](tools/operations/README.md)

Application deployment never starts paid AI or a lexicon build. Lexicon JSON
generation, publication, validation, and activation are a separate protected
content-release flow initiated by an operator.

On the API service, configure each `DEPLOYMENT_*_READINESS_URL` with Railway
reference variables, for example:

```env
DEPLOYMENT_ADMIN_API_READINESS_URL=http://${{admin-api.RAILWAY_PRIVATE_DOMAIN}}:${{admin-api.PORT}}/health/ready
DEPLOYMENT_AGENT_EXECUTOR_READINESS_URL=http://${{agent-executor.RAILWAY_PRIVATE_DOMAIN}}:${{agent-executor.PORT}}/ready
```

Set `PORT` explicitly on every referenced service. Railway private networking
requires the target service's actual listening port; the application does not
fall back to hard-coded Railway ports. The complete nine-variable list is in
`apps/backends/api/.env.example`.

Configure `SYLIS_WEB_URL`, `SYLIS_ADMIN_URL`, and `SYLIS_API_URL` in both GitHub
deployment environments. Configure the five `SYLIS_SYNTHETIC_*` values as API
service sealed variables and matching GitHub environment secrets. The dedicated
`sylis / production-synthetic` environment runs hourly authenticated probes;
its Notebook write is prefix-scoped and removed both in-test and by an
always-run fallback cleanup.

For production release evidence, configure the same independent
`DEPLOYMENT_INGEST_TOKEN` in the protected GitHub production environment and as
a sealed Admin API Railway variable. The Admin API also needs
`DEPLOYMENT_INGEST_DATABASE_URL` selecting the `sylis_ci_ingestor` PostgreSQL
role; its ordinary `DATABASE_URL` continues to select `sylis_admin_api`.
After production smoke succeeds, GitHub Actions calls the exact Admin ingress
`/internal/v1/deployment-releases`; the workflow does not receive a database
credential, and the Admin browser has no write route or table privilege.
