# platform-sample-backend

A deliberately small Fastify service used to exercise the delivery flow in
[platform-delivery](https://github.com/rootsher/platform-delivery). The service
itself is boring on purpose. What matters is what happens to it between a
commit and a running pod.

## What it does

A notes API on Postgres:

```
GET  /api/notes?limit=20
GET  /api/notes/:id
POST /api/notes          {"title": "...", "body": "..."}
```

Plus the endpoints the platform relies on:

- `/healthz` for liveness. It never touches the database, so a Postgres blip
  does not restart every pod at once.
- `/readyz` for readiness, which does check the database.
- `/metrics` in Prometheus format, with request duration by route template.

On SIGTERM it stops accepting connections, finishes what is in flight and
closes the pool.

## Running it

Needs Node 24 and a Postgres you can reach.

```sh
npm ci
export DATABASE_URL=postgres://app:app@localhost:5432/app
npm run migrate up
npm run dev
```

Tests run against a real database, not a mock:

```sh
export TEST_DATABASE_URL=postgres://app:app@localhost:5432/app_test
npm test
```

## Migrations

Plain SQL files in `migrations/`, applied with
[node-pg-migrate](https://github.com/salsita/node-pg-migrate). Every file has
an up and a down part, and a test walks all of them up and back down one step
at a time, comparing the schema after each down with what it was before the
matching up.

The image ships with its migrations. In the cluster they run as a separate job
from the same digest before the new pods start, so code and schema cannot drift
apart. Migrations are written expand then contract: release N only adds, and
release N-1 still works against the schema N left behind. That keeps a
rollback down to reverting the digest. Running a down migration is a separate,
deliberate step.

## Pipeline

Every pull request and every push to `main` runs:

1. lint, type check, tests against Postgres 18, build,
2. gitleaks over the full history and semgrep over the code and Dockerfile,
3. an image build, a CycloneDX SBOM from syft and a grype scan of that SBOM.
   High and critical findings with a fix available fail the build.

On `main` the image is also pushed to GHCR, signed with cosign (keyless,
through the workflow's OIDC identity), and gets the SBOM and SLSA build
provenance attached as attestations.

Dependencies, base images and action digests are kept current by Renovate.
