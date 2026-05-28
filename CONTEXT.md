# Ymagine — Layer 1 (Task Routing)

> ICM Layer 1. "What do you want to do → which stage handles it." Read after `CLAUDE.md`.
> Each stage folder has its own `CONTEXT.md` (Layer 2) with the Inputs / Process / Outputs contract.

## Route by intent

| You want to… | Go to | Notes |
|---|---|---|
| Add / change a feature, fix a bug | `icm/stages/01_ship_feature/CONTEXT.md` | The default path for code changes |
| Audit security / run a pentest | `icm/stages/02_security_audit/CONTEXT.md` | Invokes `/pentest`; needs authorization (we own the system) |
| Translate UI to PT-BR (or flip locale default) | `icm/stages/03_i18n/CONTEXT.md` | next-intl + direct-string strategy |
| Upgrade Next / React / risky dep | `icm/stages/04_dep_upgrade/CONTEXT.md` | Suna's Next 15→16 is the worked example — read it first |
| CI workflow is failing | `icm/stages/05_ci_repair/CONTEXT.md` | Diagnose the workflow, not the app |
| Editing shell scripts / Dockerfile / host-exec | `icm/stages/06_shell_or_docker/CONTEXT.md` | Highest-risk surface — Suna had 4 prod incidents here |
| Editing agent system prompts / persona / model routing | `icm/stages/07_ai_agent_work/CONTEXT.md` | Different verify discipline — prompts aren't CI-testable |
| Just understand the system | `icm/references/architecture.md` | No stage needed |
| Deploy / rollback / VPS ops | `icm/references/deploy-runbook.md` | ⚠ gitignored, operator-only |

## Always-relevant references (Layer 3)

These are referenced by multiple stages. Re-read whichever the stage's Inputs table points at:

**Project-specific**
- `icm/references/architecture.md` — stack, monorepo layout, services, ports
- `icm/references/conventions.md` — code standards, PT-BR i18n rules, commit style, branch/PR flow
- `icm/references/decisions.md` — ADR-style log of why things are the way they are
- `icm/references/claude-failure-modes.md` — **bugs Claude shipped in `DenisCDev/suna`; DO NOT repeat them here**
- `icm/references/ci-cd-map.md` — which workflow fires on which trigger / paths

**Stack best practices (official-docs-sourced)**
- `icm/references/stack/frontend.md` — Next 15.5 / React 18 / Tailwind 4 / Radix / next-intl / TanStack / Sentry / Konva
- `icm/references/stack/backend.md` — Hono / Bun 1.2 / Drizzle / Supabase self-hosted / pnpm / Zod / Postgres 15

**Model behavior (for editing prompts / model routing)**
- `icm/references/models/coding-routers.md` — Kimi K2.6 / Grok 4.20 MA / MiMo V2.5 + V2.5-Pro
- `icm/references/models/frontier-and-specialists.md` — Opus 4.7/4.8 / GPT-5.5 / Gemini 3.1 Pro+Flash 3.5 / Sabiá-4 (PT-BR+legal) / vision SOTA / routing matrix

**Engineering theory (Humble / Farley / SRE / Forsgren / Majors / Gregg / NIST SSDF)**
- `icm/references/quality-gates-and-deploy-safety.md` — pre-merge gates / promotion / post-deploy verification / observability without pegging the VPS / auto-rollback / anti-patterns

**Operator-only (gitignored, not in repo)**
- `icm/references/deploy-runbook.md` — CI/CD + VPS + rollback ⚠ gitignored
- `icm/references/security-state.md` — pentest findings + what's pending ⚠ gitignored
- `icm/references/integrations.md` — provider keys status ⚠ gitignored

## Global rules (apply to every stage)

1. **Sequential + reviewed.** Do one stage's job, write its output, let the human review before the next.
2. **`main` = production.** Never commit straight to main. Branch → PR → `ci-build` green → merge → verify prod.
3. **i18n** — when translating, PT-BR for all user-facing text; code/comments/identifiers stay English. (Default locale flip is a separate decision — see Stage 03.)
4. **Secrets** only in gitignored files. Never echo a private key into the transcript or a committed file.
5. Per-run artifacts (plans, reports, drafts) → `icm/output/` (gitignored).
6. **Before claiming "done"**, run the stage's Verify checklist. The Suna repo proved that "it built locally" is not evidence the prod container will boot.
