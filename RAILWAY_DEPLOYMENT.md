# Railway deployment

Sylis deploys six application images built by GitHub Actions from the exact
workflow commit:

- `api`
- `web`
- `admin`
- `worker`
- `compiler-runner`
- `importer`

PostgreSQL and Redis remain Railway managed services. Application services use
private GHCR image sources pinned by digest; Railway does not rebuild the Git
repository. `develop` deploys the protected staging environment and `main`
deploys the protected production environment only after every required CI job
passes.

The authoritative setup, variable ownership, Volume layout, release flow,
rollback procedure, and secret policy are maintained in:

- [CI/CD, Railway and secrets](docs/overview/refactor/delivery/cicd-security.md)
- [Runtime configuration](docs/overview/guide/configuration.md)
- [Operations CLI](tools/operations/README.md)

Do not restore the removed ECDICT importer/enricher services, legacy JWT
variables, GitHub source autodeploy, or `Wait for CI`. Lexicon JSON generation,
import, validation, and activation are a separate protected content-release
workflow; application deployment never starts an AI build automatically.
