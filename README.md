# platform-sample-backend

A deliberately small Fastify service used to exercise the delivery flow in
[platform-delivery](https://github.com/rootsher/platform-delivery). The service
itself is boring on purpose. What matters is what happens to it between a
commit and a running pod.

## Stack

| Layer | Tool | Role |
| --- | --- | --- |
| Runtime | Node.js 24, TypeScript | Node runs the TypeScript sources directly in development; the image ships compiled JavaScript |
| HTTP | Fastify | routes, JSON schema validation, graceful close |
| Database | Postgres 18 through `pg` | a plain connection pool, no ORM |
| Migrations | node-pg-migrate | plain SQL files with an up and a down part |
| Metrics | `@prometheus-io/client` | request duration by route template on `/metrics` |
| Tests | Vitest | run against a real Postgres, including a check that every migration reverses |
| Lint | ESLint with typescript-eslint | strict, type checked rules |
| Image | distroless `nodejs24`, non-root | no shell, no package manager, runs as 65532 |
| CI | GitHub Actions | every action pinned by commit SHA |
| Secrets scan | gitleaks | full history, not only the diff |
| Code scan | Semgrep | TypeScript, Node.js and Dockerfile rules |
| SBOM | Syft | CycloneDX, generated from the built image |
| Vulnerabilities | Grype | fails the build on high and critical findings that have a fix |
| Signing | cosign, keyless | signed with the workflow's GitHub OIDC identity and recorded in Rekor |
| Attestations | cosign, `actions/attest-build-provenance` | the SBOM and SLSA build provenance, attached to the digest |
| Registry | GHCR | images are addressed by digest from here on |
| Promotion | GitHub App token, `gh` | opens the staging pull request in platform-delivery |
| Updates | Renovate | npm packages, base images and action digests |

Everything after the registry (how the digest reaches a cluster, what checks it
at admission, how it is promoted and rolled back) lives in
[platform-delivery](https://github.com/rootsher/platform-delivery), which has
the full flow drawn out.

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
provenance attached as attestations. The last job opens a pull request in
platform-delivery that moves staging to the new digest and merges itself once
that repo's checks pass.

Dependencies, base images and action digests are kept current by Renovate.
