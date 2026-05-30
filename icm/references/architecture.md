# Architecture (Layer 3 — reference, committed)

## Monorepo (pnpm 8.15.8, Node 22)

```
apps/web         Next.js 15.5.14 + React 18 frontend (App Router, Turbopack dev)
apps/api         Hono + Bun TypeScript backend API (runs TS directly, no compile step)
apps/mobile      Expo / React Native
apps/desktop     Tauri
apps/frontend    ⚠ EMPTY legacy stub (only next-env.d.ts) — ignore, do not write here
packages/shared  @kortix/shared (workspace:*)
packages/db      @kortix/db — Drizzle schema + barrel exports
packages/agent-tunnel  tunnel for sandbox container
packages/voice   voice features
packages/kortix-ocx-registry  OCX registry
core/            sandbox / docker assets (kortix/computer image)
supabase/migrations  SQL migrations applied at runtime via ensureSchema()
docs/            docs content
```

Build: `pnpm -r run build` (root). `apps/web`: `pnpm --filter Kortix-Computer-Frontend build`.

## Frontend (`apps/web`)

- App Router under `src/app/`.
- **`src/middleware.ts`** — Next 15 middleware (auth gating, locale, instance-scoped routing). When upgrading to Next 16, this renames to `src/proxy.ts` and the export `middleware` → `proxy`. See Suna decisions D-003 in [[claude-failure-modes]].
- i18n: `src/i18n/config.ts` — 8 locales, **`defaultLocale = 'en'`** (Suna already flipped this to 'pt' — see [[decisions]] D-001).
- Translations in `apps/web/translations/{en,pt,de,it,zh,ja,fr,es}.json`.
- `next.config.ts`:
  - `output: 'standalone'`
  - `typescript.ignoreBuildErrors: true` — **the build does not typecheck; types must be gated separately if you want them enforced** (see [[claude-failure-modes]] §2).
  - `webpack:` key STILL PRESENT (Konva externalization). At Next 16 this gets dropped and Turbopack handles canvas via `turbopack.resolveAlias`.
  - `images`, `experimental.optimizePackageImports`, security headers, Sentry tunnel `/monitoring`, rewrites for `/v1/*` → `http://localhost:8008` (dev CORS bypass), PostHog ingest rewrites.
  - Wrapped by `withSentryConfig` + `withBetterStack` + `createMDX` (fumadocs).

## API (`apps/api`)

- Hono on Bun. `apps/api/Dockerfile` builds `oven/bun:1.2-slim`.
- **Runs `bun run src/index.ts` directly — there is no compile step in the runtime image.** Consequence: a missing / unresolved export takes down the API at boot (this happened in Suna with `@kortix/db`'s barrel — see [[claude-failure-modes]] §2).
- Deps stage uses `node:22-slim` + pnpm with `--shamefully-hoist` (flat node_modules) and `--prod=false` (devDeps included so drizzle-kit can run schema push at runtime).
- Migrations: `supabase/migrations/` is COPY'd into the image and applied at runtime by `ensureSchema()`.
- `agent-tunnel` has a special resolution fix in the Dockerfile (lines 71-77) — pnpm symlinks the workspace package, but those symlinks don't survive the multi-stage copy; the Dockerfile manually copies `src/` + `package.json` to `node_modules/agent-tunnel/`.

## Sandbox / `core/`

- Builds the `kortix/computer` Ubuntu+KDE container that runs per session.
- **Two provisioning paths, chosen by `ALLOWED_SANDBOX_PROVIDERS` in the api env:**
  - **`local_docker` — what the Hostinger self-hosted deploy actually uses.** The sandbox is
    a LOCAL docker container `kortix-hosted-sandbox` ON the VPS, managed by the api via the
    docker socket (`apps/api/src/platform/providers/local-docker.ts`). `docker ps` on the VPS
    shows it beside api/frontend/supabase. `/workspace` = named volume `kortix-sandbox-data`
    (survives container recreate); `/persistent` = durable kortix state; `/ephemeral/kortix-master/`
    = the in-sandbox Hono server (`/kortix/*` API), **replaced on image update** (user data in
    `/workspace` persists). Image tag = `config.SANDBOX_IMAGE`, set in `/root/.kortix/.env`.
  - **`justavps`** — the cloud path: image snapshotted into JustAVPS via `snapshot-build.yml`.
- **The sandbox image does NOT ship via `deploy-hostinger`** (that's api+frontend → GHCR only).
  The fork can build its OWN image to **GHCR with the built-in `GITHUB_TOKEN`** (no Docker Hub)
  via `.github/workflows/build-sandbox-image.yml` → `ghcr.io/bernardoxlima/ymagineapp-computer:<tag>`,
  point `SANDBOX_IMAGE` at it, and for a PRIVATE image set `GHCR_PULL_USER`/`GHCR_PULL_TOKEN`
  (read:packages) in the api env. See [[decisions]] D-022 + [[claude-failure-modes]] §11.
- `core/docker/docker-compose.yml` + `docker-compose.dev.yml` for local sandbox dev.

## Deploy topology (Hostinger VPS via `deploy-hostinger.yml`)

```
push to main (paths) → GH Actions build api+frontend
                    → push GHCR (ghcr.io/bernardoxlima/ymagineapp-{api,frontend}:<sha8>)
                    → SSH to VPS → docker compose pull/up
```

See `icm/references/deploy-runbook.md` (⚠ gitignored) for VPS host, SSH details, rollback procedure.

## Request path (production)

`browser → Cloudflare → Caddy (VPS) → container`

Caddy handles: security headers (HSTS / nosniff / Referrer-Policy / strip Via+Server+X-Powered-By), `/auth/v1/settings` blocked, CORS normalization on the API.

## Credits / billing

Tables in `kortix` schema (`credit_accounts`, `credit_ledger`, `account_members`, `accounts`). Mutations through Postgres RPCs `atomic_*` in `public` schema. **Ownership enforced inside the RPCs** (`auth.uid()` must be a member of `p_account_id`; service_role bypasses) — Suna had a BOLA vulnerability here (D-004 in [[decisions]]).
