# Ymagine / Kortix — Layer 0 (Identity)

> ICM Layer 0. Auto-loaded. "Where am I, what is this, how do I find things."
> To DO anything: read `CONTEXT.md` (L1 — intent → stage) → then the matching
> `icm/stages/NN_*/CONTEXT.md` (L2 — Inputs / Process / Verify). Don't route from this file alone;
> the stage contract has the Inputs + Verify you need. Before coding, scan
> `icm/references/claude-failure-modes.md` (L3) — bugs Claude shipped in the sister
> `DenisCDev/suna` repo. Don't repeat them.

## What this is

**ymagineApp** (`D:\ymagineApp`) — private fork of **Kortix / Suna**, an open-source AI agent platform
(multi-agent "cortex" + sandbox computer). Operated by **Condado Studio** (Denis = dev, Bernardo =
discovery/client) under the brand **Ymagine**, on a Hostinger VPS for internal/enterprise use. The
sister repo `DenisCDev/suna` is more battle-scarred — its mistakes are catalogued in `claude-failure-modes.md`.

## Stack (current — NOT yet on Suna's newer stack)

| Component | Version / notes |
|---|---|
| Frontend | **Next.js 15.5.14 + React 18**, dir `apps/web` (`apps/frontend` is a dead stub — ignore) |
| Middleware | `apps/web/src/middleware.ts` (Next 15 name; renames to `proxy.ts` at the Next 16 jump) |
| API | **Hono + Bun** (`oven/bun:1.2-slim`), `apps/api` — runs TS directly, **no compile step in Docker** |
| Mobile · Desktop | Expo/RN `apps/mobile` · Tauri `apps/desktop` |
| Monorepo | pnpm 8.15.8, Node 22 — `apps/*`, `packages/*`, `core/*` |
| DB | Supabase self-hosted — migrations in `supabase/migrations/` |
| i18n | next-intl, 8 locales, **`defaultLocale = 'en'`** |
| Sandbox | `core/` builds the `kortix/computer` image; prod runs it as a **LOCAL docker container on the VPS** (D-022) |

Full detail → `icm/references/architecture.md`.

## How it's deployed

`main` = **production, auto-deploy**. Branch → PR → green `ci-build` → merge → watch deploy → verify.
- `apps/api` / `apps/web` / `packages` / `supabase/migrations` push to `main` → **`deploy-hostinger`** (build GHCR images → SSH deploy).
- `core/` does **NOT** ship via `deploy-hostinger` — it's a separate sandbox-image pipeline (Stage 08).
- PRs run **`ci-build`** (no deploy; catches missing-export boot crashes). Full trigger map → `icm/references/ci-cd-map.md`.

## How to find things

- **Routing / what-to-do** → `CONTEXT.md` (L1) → the matching `icm/stages/NN_*/CONTEXT.md` (L2). The 8 stages live in L1; the stage file has the Inputs table + Verify checklist — use them, don't shortcut from here.
- **Maps (non-secret)** → `icm/references/`: `architecture` · `conventions` · `decisions` · `claude-failure-modes` · `ci-cd-map` · `stack/{frontend,backend,agents}` · `models/*` · `quality-gates-and-deploy-safety`. Load per the stage's Inputs table — don't eager-load all of them.
- **Operator-only (gitignored, not in repo)** → `icm/references/deploy-runbook.md` (VPS host, SSH, rollback) + `security-state.md`. Missing? You're on a clone without operator context — ask Denis before touching deploy.

## Non-negotiables (this is production — Suna's commits proved it)

1. **`main` is live.** Branch → PR → green `ci-build` → merge → verify prod returned 200 + container booted clean.
2. **Bun does not typecheck.** The api image runs TS via Bun with no compile step → missing exports crash the container at boot. `ci-build` runs `bun build` on apps/api as the boot gate. See `claude-failure-modes.md` §2.
3. **`/bin/sh` on Debian/Ubuntu is dash, not bash.** No `pipefail`, `[[ ]]`, or arrays in any script that runs on the VPS host. §1.
4. **Shell quoting through SSH/docker exec is a minefield.** Single-quote the inner command; verify `$(...)` lands in the container, not the host. Prefer feeding scripts via a `'sh -s' <<'EOF'` heredoc. §1, §14.
5. **Secrets never go in committed files.** VPS/IP/keys → the gitignored runbook only; never echo a key into the transcript.
6. **Per-run artifacts** (plans, reports, drafts) → `icm/output/` (gitignored). Never commit them.
