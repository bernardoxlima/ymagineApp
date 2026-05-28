# Decisions Log (Layer 3 — reference, committed)

ADR-style. Why things are the way they are, so future sessions don't undo them.

## D-001 · ICM workspace adopted

This `icm/` structure + root `CLAUDE.md` / `CONTEXT.md` is our context-capture layer
(based on the Interpretable Context Methodology paper, arXiv:2603.16021v2). Secret refs
(`deploy-runbook.md`, `security-state.md`) are gitignored. Layered context loading:
L0 (identity) → L1 (routing) → L2 (stage contract) → L3 (reference) → L4 (working artifacts).

## D-002 · `claude-failure-modes.md` is mandatory pre-read

Every coding stage's Inputs table starts with `claude-failure-modes.md`. The Suna repo
shipped at least 10 categories of bugs Claude introduced; encoding them as forced reading
is the cheapest preventive measure. Update this file whenever a new pattern emerges.

## D-003 · `ci-build.yml` is the boot-safety PR gate

PR gate that runs `bun build` on `apps/api` (catches missing exports — Suna §2) +
`pnpm --filter Kortix-Computer-Frontend build` on `apps/web` (catches frontend link errors).
NO deploy. NO typecheck (too noisy). Path-filtered: only fires on PRs that touch each side.
See [[claude-failure-modes]] §2, §8 for why this specific gate.

## D-004 · Next 15.5.14 + React 18 — NOT YET upgraded

Suna already moved to Next 16.2.6 + React 19.2 on `chore/next-16`. ymagineApp has NOT.
When we do upgrade:
- Drop the `webpack:` key from `next.config.ts` (Turbopack default build; Konva handled via `turbopack.resolveAlias`).
- Rename `src/middleware.ts` → `src/proxy.ts`, function `middleware` → `proxy`.
- Bump cmdk → 1.1.1 (R19 compat), react-day-picker → 8.10.2, geist → 1.7.1, @next/third-parties → 16, eslint-config-next → 16, @novu/nextjs → 3.16, next-intl → 4.12.
- **Leave fumadocs at current version** — Suna confirmed it does NOT break the Turbopack build; only bump reactively.
- Bump `@types/react`/`@types/react-dom` → 19 (both in `apps/web/package.json` AND in root `pnpm.overrides`).
- See Stage 04 for the full process.

## D-005 · `defaultLocale = 'en'` for now

`apps/web/src/i18n/config.ts: defaultLocale = 'en'`. Suna flipped this to 'pt' (Brazilian
internal tool). ymagineApp hasn't decided yet — discuss with Bernardo before flipping.
If/when flipping: also fill any missing PT-BR keys (Suna found 4 missing sidebar keys:
`servers`, `searchServers`, `addServer`, `noServersFound`).

## D-006 · `main` auto-deploys to production via `deploy-hostinger.yml`

Push to `main` (paths: apps/api, apps/web, packages, supabase/migrations, pnpm-lock.yaml,
the workflow itself) → GHCR images `ghcr.io/bernardoxlima/ymagineapp-{api,frontend}:<sha8>`
→ SSH deploy. Rollback is "redeploy previous SHA" — see `deploy-runbook.md`.

## D-007 · Credit RPC ownership check (security baseline)

If/when porting Suna's credit system: the Postgres RPCs `atomic_use_credits`,
`atomic_add_credits`, `atomic_reset_expiring_credits` MUST guard ownership inside the
function (BOLA risk):

```sql
IF auth.uid() IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM account_members WHERE account_id = p_account_id AND user_id = auth.uid()
) THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
```

`service_role` bypasses via `auth.uid() IS NULL`. In Suna this fix was applied directly
to the DB (CREATE OR REPLACE) and is NOT in repo migrations — re-apply if rebuilding from
scratch.

## D-008 · LLM keys: BYOK server-side via OpenRouter

Self-hosted has no managed proxy. All LLM calls go through OpenRouter via the server-side
`OPENROUTER_API_KEY` in `/root/.kortix/.env`. The UI "custom provider" (BYOK) path is
fragile and causes `expected kortix_ prefix` errors — use the server key + standard model
list. See `icm/references/integrations.md` (added when keys are configured) for current
status.

## D-009 · Web search / scrape / image search — defer until needed

`TAVILY_API_KEY` (web search), `FIRECRAWL_API_KEY` (scrape), `SERPER_API_KEY` (image
search) are intentionally UNSET. Those agent tools are disabled. Enable by adding the
key to `/root/.kortix/.env` and restarting the api container — do NOT paste keys in chat.

## D-010 · `apps/frontend` is dead code

`apps/frontend/` contains only `next-env.d.ts`. It is legacy. Do not write to it.
`apps/web/` is the active Next.js app.
