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

## D-011 · Drizzle CVE-2026-39356 — audit pending

`sql.identifier` / `.as` escaping vulnerability in Drizzle ORM. Backend research flagged
this as **must-fix**: verify the version in `packages/db/package.json` is past the fix
release, and audit any code path that passes user-controlled strings to `sql.identifier()`
or to a `.as(name)` alias. Cite: stack/backend.md "ALIGNMENT FLAGS" table + Drizzle GHSA.

## D-012 · Postgres SECURITY DEFINER functions MUST set `search_path = ''`

Per `postgresql.org/docs/15/sql-createfunction.html` and Supabase's hardening guide:
every `SECURITY DEFINER` function MUST include `SET search_path = ''` (or an explicit
non-public path) in its definition, or it is exploitable via search_path manipulation
by any role with `CREATE` on a writable schema. This is **non-negotiable per upstream
Postgres**. When porting Suna's `atomic_*` credit RPCs (D-007), this is part of the
canonical definition. Existing `atomic_*` functions in production should be audited.

## D-013 · Sabiá-4 (Maritaca) is the recommended model for PT-BR + Brazilian legal

Maritaca's Sabiá-4 wins published Brazilian benchmarks:
- OAB-Bench (exame da OAB): 7.49
- Brazilian Laws task: 97.4%
- Cost: $0.93 / $3.70 per MTok — roughly **5x cheaper than Opus 4.7** for the same task.

When Claude Code writes/edits an agent in ymagineApp that operates in PT-BR on Brazilian
legal content, route to Sabiá-4 first; Gemini 3.1 Pro is the fallback (it ranks #1 on
Magis-Bench for Brazilian judicial). See `references/models/frontier-and-specialists.md`
"Brazilian judicial / legal" section for the full benchmark table and the routing matrix
at the end of that file.

## D-014 · Claude Opus 4.8 shipped 2026-05-28 — same price as 4.7

Released same day as the model-research turn. 4.8 keeps 4.7 pricing ($5/$25 per MTok),
adds mid-conversation system messages, lowers the prompt-cache minimum to 1,024 tokens,
defaults `effort: high`, and ships a fast-mode preview. 4.7 remains GA. Recommend
adopting 4.8 for new agent definitions, leaving 4.7-pinned agents alone until a
deliberate cutover. Source: model card delta in `references/models/frontier-and-specialists.md`.

## D-015 · Grok 4.20 Multi-Agent is INCOMPATIBLE with custom tools

`x-ai/grok-4.20-multi-agent` is Responses-API-only, supports ONLY xAI's built-in tools
(`web_search`, `x_search`, `code_execution`, `collections_search`), and rejects
`max_tokens`. This rules it out for every Kortix agent that uses `consultar_autor` or
any other custom tool — most of the codebase. Use it only as a one-shot research
wrapper, not as a main-loop model. Source: `references/models/coding-routers.md`.

## D-016 · `apps/api/src/__tests__/` has 51 test files NOT wired to CI

Backend research + quality-gates research independently found this: 31 `unit-*.test.ts`,
13 `e2e-*.test.ts`, plus billing suites — none invoked by any `.github/workflows/*.yml`.
This is the highest-leverage missing gate per Humble & Farley's pipeline model (the
cheap, fast unit-test stage that catches 80%+ of regressions). Add a `bun test` job to
`ci-build.yml` running at minimum the `unit-*.test.ts` files. Source: quality-gates
checklist item #1.

## D-017 · Observability sampling: keep `tracesSampleRate: 0.2`

`apps/api/src/lib/sentry.ts` already does this correctly: 20% trace sampling in prod,
ECONN/AbortError filtered as `ignoreErrors`, `/health` filtered from transactions,
sensitive headers redacted in `beforeSend`. Per *Observability Engineering* (Majors et
al, 2022) Ch 1-3: high-cardinality structured events scale by sampling; never sample
errors. The current config matches this. **DO NOT raise sampling to 100% in prod** —
that's the canonical over-instrumentation trap. Source: quality-gates §4.

## D-018 · `ensureSchema()` boot-time migration needs `pg_try_advisory_xact_lock`

Per Supabase docs the canonical migration flow is `supabase db push` or CLI-applied
migrations. ymagineApp applies migrations at api container boot via `ensureSchema()`.
Under multi-replica deploys this races. Even on the single-host VPS, the api container
restart + migration must be idempotent and guarded by `pg_try_advisory_xact_lock` so
two concurrent boots can't half-apply. Source: stack/backend.md ALIGNMENT FLAGS.

## D-019 · `pnpm deploy` is the correct multi-stage Docker pattern

The api Dockerfile uses `pnpm install --shamefully-hoist` and a manual `agent-tunnel`
symlink workaround (lines 71-77). The pnpm-recommended approach for Docker multi-stage
is `pnpm deploy --filter=<service> /out` which produces a self-contained, symlink-free
deployment that survives `COPY --from=deps` cleanly. Migrating to this eliminates the
agent-tunnel workaround. Source: stack/backend.md.

## D-020 · `kortix-yolo` provider removed (and dead `kortix` provider deleted)

Removed any dependency on creating an account at kortix.com (the upstream company
hosted product). Specifically:

- **opencode.jsonc** — deleted the `kortix-yolo` provider block (was using
  `@ai-sdk/anthropic` against `api-yolo.kortix.com`) AND the commented-out `kortix`
  provider block (dead code from a prior router experiment).
- **`apps/api/src/router/config/models.ts`** — deleted the 4 `kortix/*` aliases
  (`kortix/minimax-m27`, `kortix/glm-turbo`, `kortix/kimi`, `kortix/minimax`); they
  existed solely to translate the (commented-out) `kortix` opencode provider.
- **Legacy alias map added** — `LEGACY_ALIAS_MAP` in the same file rewrites stale
  IDs to canonical upstream equivalents so persisted state (DB rows, user prefs,
  agent definitions still pointing at `kortix-yolo/think` etc.) continues to work
  without 400s at the provider. Mappings:
  - `kortix/minimax-m27` → `minimax/minimax-m2.7`
  - `kortix/glm-turbo` → `z-ai/glm-5-turbo`
  - `kortix/kimi` → `moonshotai/kimi-k2.5`
  - `kortix/minimax` → `minimax/minimax-m2.5`
  - `kortix-yolo/fast` → `anthropic/claude-sonnet-4-6`
  - `kortix-yolo/think` → `anthropic/claude-sonnet-4-6`
  This is `claude-failure-modes.md` §7 (happy-path features that forget existing
  data) applied: removing the provider AND covering pre-existing references.
- **UI provider picker** — removed `kortix-yolo` + `kortix` from
  `MODEL_SELECTOR_PROVIDER_IDS`, `PROVIDER_LABELS`, `PROVIDER_NOTES`,
  `PROVIDER_ICON_MAP` in `apps/web/src/components/providers/provider-branding.tsx`.
- **Sandbox env injection** — stopped writing `KORTIX_YOLO_API_KEY` / `KORTIX_YOLO_URL`
  into sandbox containers across `apps/api/src/pool/env-injector.ts`,
  `apps/api/src/platform/providers/justavps.ts`,
  `apps/api/src/platform/services/sandbox-auth.ts`,
  `apps/api/src/platform/services/sandbox-health.ts`,
  `apps/api/src/scripts/rekey-restored-sandboxes.ts`.
- **`apps/api/src/config.ts`** — removed `KORTIX_YOLO_URL` env var definition.
- **`core/kortix-master/src/index.ts` + `bootstrap-env.ts` + test** — removed
  `KORTIX_YOLO_API_KEY` and `KORTIX_YOLO_URL` from `CORE_VARS` and the canonical-token
  normalize loop.
- **`account-state.ts`** — deleted `getYoloUsage()` function (was calling
  `KORTIX_YOLO_URL/me`), removed `yolo_usage` field from `AccountStateResponse`
  type (`apps/api/src/types.ts` + `apps/web/src/lib/api/billing.ts`), and deleted
  the "Kortix YOLO" card UI in `apps/web/src/components/settings/user-settings-modal.tsx`
  (which linked to `https://yolo.kortix.com`).
- **`project-v2-seed.ts`** — simplified `resolveDefaultModel()` to only:
  (1) `override`, (2) `KORTIX_DEFAULT_AGENT_MODEL` env, (3) default to
  `anthropic/claude-sonnet-4-6`. The previous YOLO and `kortix/minimax-m27`
  fallback branches are gone (the `LEGACY_ALIAS_MAP` covers persisted state).
- **`ticket-tools.ts`** — updated `default_model` tool-arg docstring example.
- **`run-opencode-serve.sh`** — removed `KORTIX_YOLO_*` from the post-boot
  env-source list.

NOT touched (separate concern):
- `kortix_<32>` / `kortix_sb_<32>` API key prefixes — these are THIS instance's own
  keys, not pointing at kortix.com.
- `@kortix/*` workspace package names — internal monorepo naming.
- `kortix` Postgres schema — internal DB schema name.
- `kortix.com` references in `apps/web/public/robots.txt` Sitemap,
  `apps/web/src/app/share/[shareId]/layout.tsx` fallback APP_URL, and legal contact
  emails in `apps/web/src/app/legal/page.tsx` — branding leaks, separate decision
  (would need confirmation of replacement domains/emails first).

## D-021 · Frontend HIDDEN_PROVIDER_IDS filter (defensive — supplements D-020)

After D-020 shipped, the model selector still showed `kortix-yolo/fast` and
`kortix-yolo/think`. Investigation revealed:

- The model picker's source of truth is `client.provider.list()` from the OpenCode
  SDK — OpenCode runs INSIDE the sandbox container.
- OpenCode reads its provider list from `opencode.jsonc` baked into the sandbox
  Docker image (`kortix/computer:<tag>` pulled from upstream Docker Hub at install).
- `deploy-hostinger.yml` rebuilds api + frontend only. The sandbox image is built
  by `snapshot-build.yml` (and ultimately upstream `kortix-ai/suna`). Our fork's
  edits to `core/kortix-master/opencode/opencode.jsonc` only reach prod when that
  separate pipeline catches up.
- Even after our code change merges, existing sandbox containers keep the old
  config baked in until the image is replaced.
- `apps/web/src/components/providers/provider-branding.tsx`
  `MODEL_SELECTOR_PROVIDER_IDS` is only an ORDERING signal (selector lines 147-152
  used it to sort) — entries not in the list still RENDER, just at the bottom.

**Fix.** Add `HIDDEN_PROVIDER_IDS` (a Set) to `provider-branding.tsx` and filter
`visibleModels` in `model-selector.tsx` unconditionally — even search-query matches
are hidden. Defensive: stays correct regardless of what OpenCode returns, regardless
of localStorage cache state, regardless of when (if ever) the sandbox image picks up
our `opencode.jsonc` changes.

If a user previously had `kortix-yolo/think` as their selected model, the picker
falls back to displaying the first available model name; the API request still
routes correctly because of `LEGACY_ALIAS_MAP` in `apps/api/src/router/config/models.ts`
(rewrites to `anthropic/claude-sonnet-4-6`).

**Future cleanup.** When the sandbox image carries our updated `opencode.jsonc`
(separate work), the filter becomes redundant — but harmless. Leave it as
belt-and-suspenders.

## D-022 · Projects/Board tab re-enabled — intentional divergence from upstream single-workspace

**Symptom.** The "Project view" tab (Board + Milestones + Team) vanished from the app.
Reported as "the projects tab in the left sidebar disappeared out of nowhere."

**Root cause.** Upstream Kortix commit `c1aa27084` ("Stabilize OpenCode sandbox runtime",
author marko-kraemer, 2026-05-06) was pulled into `main` and flipped the product to
**single-workspace mode**. It:
- Deleted the `project-view-quick` (`/board`) and `projects` (`/projects`) entries from
  `apps/web/src/lib/menu-registry.ts` entirely, plus the `instance-projects` settings tab.
- Removed the flag gate `(!item.requiresProjectsFlag || featureFlags.enableProjects)` from
  `getItemsByGroup`.
- Gutted `app/(dashboard)/projects/[id]/page.tsx` (949 lines → stub) and turned
  `app/(dashboard)/projects/page.tsx` into a `redirect('/workspace')`.
- Deleted `instance-projects-panel.tsx` (−475), `project-selector.tsx` (−283),
  `channel-project-picker.tsx` (−73).
- Left `featureFlags.enableProjects` (`NEXT_PUBLIC_ENABLE_PROJECTS`, default **false**) as
  the master gate for the remaining project surfaces (`/board` redirect, project-only
  agents, "add to board" trigger).

The tab was a **right-sidebar** entry (`getNavItemsClustered('rightSidebar', ...)` in
`sidebar-right.tsx`), NOT left — `sidebar-left.tsx` renders a hardcoded nav and never
consumed project entries. The "left sidebar" report was a misremember.

**Decision (Bernardo: re-enable; merge was accidental).** Re-surface the **Project view**
tab and accept that this is a **deliberate fork-divergence** from upstream's single-workspace
direction — future upstream syncs will keep trying to remove it.

**Mechanism (this PR).**
1. `menu-registry.ts` — re-import `featureFlags` + `FolderKanban`, re-add the
   `project-view-quick` entry (`href: /board`, `requiresProjectsFlag: true`,
   `showIn: rightSidebar + commandPalette`), restore the gate in `getItemsByGroup`.
   This also re-aligns with the `core/kortix-master/tests/e2e/web-paradigm.sh` assertions
   that were silently failing against the diverged code.
2. `deploy-hostinger.yml` + `deploy-dev.yml` — set `NEXT_PUBLIC_ENABLE_PROJECTS=true` at
   **build time** (the flag is baked into the JS bundle by Next; it is NOT a runtime var,
   so setting it via `docker exec` on the VPS does nothing — the bundle was already compiled).
3. **Sandbox-side — baked into provisioning** (`apps/api/src/pool/env-injector.ts`):
   added `KORTIX_PROJECTS_ENABLED: 'true'` to `buildEnvPayload()`. `inject()` pushes it
   to the running container's `/env` endpoint AND persists it to the host `/etc/justavps/env`
   (read by `docker run --env-file`), so it lands at config.ts priority 1 (process.env) and
   `config.PROJECTS_ENABLED` resolves true on boot → the LLM `project_*`/`ticket_*` tools
   register. Without it the Board UI loads but every ticket call 503s.
   - **New / re-provisioned / updated sandboxes:** get the flag automatically (inject runs on
     claim / provision / sandbox-update).
   - **An already-running sandbox** picks it up after one inject+restart cycle — cleanest via
     the in-app sandbox **Update**/restart control (re-runs injection), NOT raw SSH. Fallback
     if needed: `docker exec <c> sh -c 'printf true > /persistent/.kortix-projects-enabled'`
     then `docker restart <c>` (the `/persistent` file is priority 2, survives respawn;
     config reads it with `.trim()`). Container name lives in the gitignored `deploy-runbook.md`.

**NOT restored (deliberately).** The `/projects` list route (stub redirect) and the
`instance-projects` settings tab (its panel `instance-projects-panel.tsx` was deleted) —
only the working `/board` Project view is brought back. Re-add those later only if needed.

This is `claude-failure-modes.md` discipline: a runtime-named upstream merge quietly
removed a user-facing feature; the fix restores it at the right layer (build flag + registry)
rather than poking the running container. [[D-006]] [[D-021]]
