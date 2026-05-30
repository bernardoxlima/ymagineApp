# CI/CD Map (Layer 3 — reference, committed)

> Which workflow fires on which trigger, what it builds, what it deploys, where to look
> when it breaks. Updated 2026-05-28.

## Workflows in `.github/workflows/`

| File | Trigger | Builds | Deploys | When it runs |
|---|---|---|---|---|
| `ci-build.yml` | **PR** (paths: api / web / packages / lockfile) | api (bun build → boot-safety) + web (next build) | ❌ no | Every PR touching those paths |
| `deploy-hostinger.yml` | Push to `main` (paths) + `workflow_dispatch` | api + frontend images → GHCR | ✅ Hostinger VPS | Every merge to main |
| `deploy-dev.yml` | Push to `main` (paths, gated by `vars.AUTO_DEPLOY_DEV`) + dispatch | Multi-arch (amd64 + arm64), path-filtered | ✅ dev VPS | Continuous dev (when enabled) |
| `release.yml` | Tag / release | Production release images | ✅ prod (release flow) | Cutting a versioned release |
| `snapshot-build.yml` | `workflow_dispatch` + `workflow_call` (from deploy-dev / release) | `kortix/computer` sandbox image | ✅ JustAVPS snapshot | Sandbox image rebuild (cloud / JustAVPS path) |
| `build-sandbox-image.yml` | `workflow_dispatch` only | sandbox image from `core/docker/Dockerfile` → **GHCR** `ghcr.io/<owner>/ymagineapp-computer:<tag>`, built-in `GITHUB_TOKEN` (no Docker Hub) | pushes to GHCR (no VPS) | Manual: ship a `core/` change to the self-hosted sandbox. See **Stage 08** + [[decisions]] D-022 |
| `trigger-staging-qa.yml` | (varies) | — | — | Staging QA trigger |
| `dependabot.yml` | scheduled | — | — | Dep PR automation |

## Path filters (which workflow cares about which files)

| Path you changed | Triggers… |
|---|---|
| `apps/api/**` | `ci-build` (api leg), `deploy-hostinger` (api leg), `deploy-dev` (api leg) |
| `apps/web/**` | `ci-build` (web leg), `deploy-hostinger` (web leg), `deploy-dev` (frontend leg) |
| `packages/**` | All of the above (shared code — rebuilds both sides) |
| `core/**` | `deploy-dev` (computer leg, if `AUTO_DEPLOY_DEV`). **NOT `deploy-hostinger`** (sandbox image is separate). To ship a `core/` change to the *running* self-hosted sandbox: `build-sandbox-image.yml` → GHCR → set `SANDBOX_IMAGE` + recreate (**Stage 08**) |
| `supabase/migrations/**` | `deploy-hostinger` (migrations run at api boot via `ensureSchema`) |
| `pnpm-lock.yaml`, `pnpm-workspace.yaml` | All build legs (lockfile changes shared deps) |
| `.github/workflows/**` | The workflow that was changed |

## What `ci-build.yml` checks (and what it doesn't)

✅ **Catches**:
- Missing exports in `apps/api` module graph → would crash container at boot ([[claude-failure-modes]] §2).
- Frontend build failures (link errors, missing modules, syntax).
- Lockfile drift if `--frozen-lockfile` is honored.

❌ **Does NOT catch**:
- TypeScript errors (`apps/web` has `ignoreBuildErrors: true`; `apps/api` builds via Bun without tsc).
- Runtime behavior (DB queries, auth, RLS, network).
- i18n key parity across locales.
- Shell-script portability bugs (dash vs bash) — those live in code that runs ON the VPS, not in the build.

For runtime confidence, the stage's Verify checklist still applies after deploy.

## Failure / recovery patterns

### CI fails on PR
1. Open the failing workflow run on GitHub → find the failing step.
2. If it's `bun build` on api: missing export. Grep for the symbol, fix the barrel.
3. If it's `next build` on web: read the stack trace. Usually a missing import or React-version-incompat dep.
4. If it's `pnpm install`: lockfile drift. Run `pnpm install --lockfile-only` locally and commit.

### Deploy fails after merge
1. Image build failed → fix forward (new PR), no rollback needed (old image still serving).
2. SSH deploy failed → check `deploy-runbook.md` for VPS access; you may need to `ssh + docker compose pull && up -d` manually.
3. Container restarted but won't come up → check container logs; common cause: missing env var on VPS or schema-migration failure.
4. To roll back: deploy the previous SHA tag (e.g. `ghcr.io/bernardoxlima/ymagineapp-api:abc12345`) — see runbook.

### Path filter "missed" my change
Audit the workflow's `paths:` block. If you changed `core/**` but expected `deploy-hostinger`
to fire, it won't — `core` is only in `deploy-dev`. By design (sandbox image is rebuilt separately).

## Things to double-check next time you touch CI

- `deploy-hostinger.yml` currently rebuilds both api AND web on any push touching the trigger paths. Suna already optimized this with `dorny/paths-filter`. Worth doing here (saves ~4min wasted on backend-only PRs).
- Node heap may need `NODE_OPTIONS=--max-old-space-size=8192` for the Next build — Suna had to bump this. There's already a `Increase frontend build heap` commit in main (f8b8d3e91).
