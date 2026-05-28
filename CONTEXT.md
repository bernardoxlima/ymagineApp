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
| Just understand the system | `icm/references/architecture.md` | No stage needed |
| Deploy / rollback / VPS ops | `icm/references/deploy-runbook.md` | ⚠ gitignored, operator-only |

## Always-relevant references (Layer 3)

These are referenced by multiple stages. Re-read whichever the stage's Inputs table points at:

- `icm/references/architecture.md` — stack, monorepo layout, services, ports
- `icm/references/conventions.md` — code standards, PT-BR i18n rules, commit style, branch/PR flow
- `icm/references/decisions.md` — ADR-style log of why things are the way they are
- `icm/references/claude-failure-modes.md` — **bugs Claude shipped in `DenisCDev/suna`; DO NOT repeat them here**
- `icm/references/ci-cd-map.md` — which workflow fires on which trigger / paths
- `icm/references/deploy-runbook.md` — CI/CD + VPS + rollback ⚠ gitignored
- `icm/references/security-state.md` — pentest findings + what's pending ⚠ gitignored

## Global rules (apply to every stage)

1. **Sequential + reviewed.** Do one stage's job, write its output, let the human review before the next.
2. **`main` = production.** Never commit straight to main. Branch → PR → `ci-build` green → merge → verify prod.
3. **i18n** — when translating, PT-BR for all user-facing text; code/comments/identifiers stay English. (Default locale flip is a separate decision — see Stage 03.)
4. **Secrets** only in gitignored files. Never echo a private key into the transcript or a committed file.
5. Per-run artifacts (plans, reports, drafts) → `icm/output/` (gitignored).
6. **Before claiming "done"**, run the stage's Verify checklist. The Suna repo proved that "it built locally" is not evidence the prod container will boot.
