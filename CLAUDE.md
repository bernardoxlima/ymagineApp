# Ymagine / Kortix — Layer 0 (Identity + Operational Map)

> ICM Layer 0. Auto-loaded by Claude Code. "Where am I, what is this, how do I access things."
> Routing → read `CONTEXT.md` (Layer 1). Stage work → read `icm/stages/NN_*/CONTEXT.md` (Layer 2).
> Before coding, ALWAYS scan `icm/references/claude-failure-modes.md` (Layer 3) — it captures
> bugs Claude shipped in the sister `DenisCDev/suna` repo. Don't repeat them.

## What this is

**ymagineApp** is a private fork / downstream of **Kortix / Suna** — an open-source AI agent
platform (multi-agent "cortex" + sandbox computer). Operated by **Condado Studio**
(Denis = dev, Bernardo = discovery/client) under the brand **Ymagine**, deployed to a
Hostinger VPS for internal/enterprise use.

- Local path: `D:\ymagineApp`
- Sister repo (already deployed, more battle-scarred): `DenisCDev/suna` — the commits there
  are a forensic log of mistakes; their fixes live in `icm/references/claude-failure-modes.md`.
- Live deploy: GitHub Actions → GHCR → Hostinger VPS (see `.github/workflows/deploy-hostinger.yml`).

## Stack (current state — NOT yet upgraded to Suna's stack)

| Component | Version | Notes |
|---|---|---|
| Frontend | **Next.js 15.5.14 + React 18** | Suna already moved to 16.2.6 + R19 — see Stage 04 |
| Frontend dir | `apps/web` | `apps/frontend` is an empty legacy stub — ignore |
| Middleware | `apps/web/src/middleware.ts` | Next 15 name. Renames to `proxy.ts` at the Next 16 jump |
| API | Hono + Bun (`oven/bun:1.2-slim`) | `apps/api`, runs TS directly, **no compile step in Docker** |
| Mobile | Expo / RN | `apps/mobile` |
| Desktop | Tauri | `apps/desktop` |
| Monorepo | pnpm 8.15.8, Node 22 | `apps/*`, `packages/*`, `core/*` |
| DB | Supabase self-hosted | migrations in `supabase/migrations/` |
| i18n | next-intl, 8 locales | **`defaultLocale = 'en'`** (Suna flipped to 'pt' — see decisions) |
| Sandbox image | `kortix/computer` | built via `core/`, snapshotted to JustAVPS |

## How it's deployed

| Workflow | Trigger | What it does |
|---|---|---|
| `.github/workflows/deploy-hostinger.yml` | push to `main` (paths: `apps/api,apps/web,packages,supabase/migrations,pnpm-lock`) | Build api+frontend images → push to GHCR (`ghcr.io/bernardoxlima/ymagineapp-*`) → SSH deploy to Hostinger VPS |
| `.github/workflows/deploy-dev.yml` | push to `main` (gated by `vars.AUTO_DEPLOY_DEV`) | Multi-arch dev build, path-filtered (only changed side), separate dev VPS |
| `.github/workflows/release.yml` | tag/release | Production release flow |
| `.github/workflows/snapshot-build.yml` | manual / called | Build `kortix/computer` sandbox image |
| `.github/workflows/ci-build.yml` | **PR (paths)** | **PR gate. No deploy. Catches missing-export boot crashes before merge** |

`main` auto-deploys to production. Never commit directly to `main`. Branch → PR → `ci-build` green → merge → watch deploy.

## Accessing things (operator-only details are gitignored)

- VPS host, SSH key fingerprints, prod URLs, rollback SHA list → `icm/references/deploy-runbook.md` (**gitignored** — present on Denis's machine only)
- Security findings status → `icm/references/security-state.md` (**gitignored**)
- If those files are missing, you're on a clone without operator context — ask Denis before touching deploy.

Non-secret maps you CAN rely on here in the repo:

**Project-specific (small, stable)**
- Architecture & services → `icm/references/architecture.md`
- Conventions (code, i18n, commits) → `icm/references/conventions.md`
- Decisions log (why things are the way they are) → `icm/references/decisions.md`
- **Claude failure modes (don't repeat these)** → `icm/references/claude-failure-modes.md`
- CI/CD workflow map (which workflow fires when) → `icm/references/ci-cd-map.md`

**Stack best practices (official-docs-sourced; load the matching one when editing)**
- Frontend (Next 15.5 / React 18 / Tailwind 4 / Radix / next-intl / TanStack / Sentry / Konva / fumadocs) → `icm/references/stack/frontend.md`
- Backend (Hono / Bun 1.2 / Drizzle / Supabase self-hosted / pnpm / Zod / Postgres 15) → `icm/references/stack/backend.md`

**Model profiles (load when editing system prompts, persona prompts, or model routing in apps/api/src/router/config/models.ts)**
- OpenRouter coding routers (Kimi K2.6, Grok 4.20 multi-agent, MiMo V2.5/V2.5-Pro) → `icm/references/models/coding-routers.md`
- Frontier flagships + domain specialists (Opus 4.7/4.8, GPT-5.5, Gemini 3.1 Pro/Flash 3.5, Sabiá-4 PT-BR/legal, vision SOTA) + routing matrix → `icm/references/models/frontier-and-specialists.md`

**Engineering theory (cross-cutting; load for any deploy/CI/observability change)**
- Quality gates + deploy safety (Humble/Farley/SRE/Forsgren/Majors/Gregg, NIST SSDF) → `icm/references/quality-gates-and-deploy-safety.md`

## The 7 workflows (Layer 2 stages)

| Stage | When to use |
|---|---|
| `icm/stages/01_ship_feature/` | Default path: build / change a feature → CI gate → deploy → verify |
| `icm/stages/02_security_audit/` | Pentest / security review (wraps `/pentest`) |
| `icm/stages/03_i18n/` | Translate a surface to PT-BR (eventually flip default locale) |
| `icm/stages/04_dep_upgrade/` | Framework / dependency upgrade — Suna's Next 15→16 is the worked example |
| `icm/stages/05_ci_repair/` | When CI breaks: diagnose the workflow, not the code |
| `icm/stages/06_shell_or_docker/` | When editing shell scripts, Dockerfiles, host-exec commands — the highest-risk surface |
| `icm/stages/07_ai_agent_work/` | When editing system prompts, persona prompts, or model routing for Kortix agents |

## Non-negotiables (this is production — Suna's commits proved it)

1. **`main` is live.** Branch → PR → green `ci-build` → merge → verify prod returned 200 + container booted clean.
2. **Bun does not typecheck.** The api Docker image runs TS via Bun with no compile step → missing exports crash the container at boot. `ci-build` runs `bun build` on apps/api as the boot-safety gate. See `claude-failure-modes.md` §2.
3. **`/bin/sh` on Debian/Ubuntu is dash, not bash.** No `pipefail`, no `[[ ]]`, no arrays in any script that runs on the VPS host. See `claude-failure-modes.md` §1.
4. **Shell quoting through SSH/docker exec is a minefield.** When constructing `sh -lc "..."` strings, prefer single-quoting the inner command and verify `$(...)` lands in the container, not the host. See `claude-failure-modes.md` §1.
5. **Secrets never go in committed files.** VPS/IP/keys → the gitignored runbook only.
6. Per-run artifacts (plans, reports, drafts) → `icm/output/` (gitignored). Never commit them.
