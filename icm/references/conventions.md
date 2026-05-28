# Conventions (Layer 3 — reference, committed)

## Language / i18n

- **All user-facing strings in PT-BR** (when localizing). Code, comments, identifiers, commit messages stay in English.
- Two i18n strategies in play:
  - **next-intl keys** (`apps/web/translations/pt.json`) for strings that already use `useTranslations()`.
  - **Direct string replacement** for hardcoded JSX (toasts, placeholders, aria-labels) — this is an internal tool, so direct PT-BR is acceptable where adding i18n keys isn't worth it.
- When adding a translated string, prefer extending `pt.json` if the component already uses `useTranslations`; otherwise inline PT-BR is fine.
- Branding: "Kortix" → "Ymagine" **in user-facing text only**. Code identifiers, env vars, package names, GHCR image names stay `kortix-*` / `ymagineapp-*` etc.
- Note: `defaultLocale = 'en'` today. Flipping to 'pt' is intentional in Suna but not yet here. See Stage 03 if/when you change it.

## Git / PR flow

- **Never commit to `main`.** It auto-deploys to production via `deploy-hostinger.yml`.
- Branch (`chore/…`, `feat/…`, `fix/…`, `ci/…`) → PR to `main` → **`ci-build` must be green** → merge → verify prod.
- Commits: imperative, English, focus on *why*. One concept per commit. Co-author trailer included.
- `.planning/` or per-run artifacts → `icm/output/` (gitignored), never committed.
- The Suna log proves that **CI being green != prod working**. Always run the stage's Verify checklist after deploy.

## Code

- Follow existing patterns in the file you're editing. Don't introduce new abstractions for one-offs.
- TypeScript: `apps/web` has `ignoreBuildErrors: true` → a green Next build is NOT a typecheck. If correctness matters, run `tsc --noEmit` separately.
- For `apps/api`: Bun runs TS directly. **Missing exports take the container down at boot.** The `ci-build` PR gate runs `bun build` to resolve the full graph and fail-fast on link errors. See [[claude-failure-modes]] §2.
- Tailwind 4 + Radix + shadcn-style components. Icons: lucide-react.
- DB schema: Drizzle in `packages/db/src/`. When adding a table, ALSO add it to the barrel export — Suna lost the api to a missing `sourceChunks` export.

## Shell / Docker / host-exec

- **`/bin/sh` on the VPS host is dash, NOT bash.** No `pipefail`, no `[[ ]]`, no arrays, no `set -o pipefail`.
- Multi-line scripts joined with `; ` produce `for i in …; do; …` — invalid. Use real newlines or a heredoc.
- When constructing `sh -lc "$(cmd)"` strings to run inside containers via `docker exec` or SSH, **prefer single quotes around the inner command** so `$(…)` evaluates inside the container, not the host.
- `grep -F` for fixed strings that contain `/+=` etc.
- Test with both bash AND dash locally if the script ships to prod.
- See [[claude-failure-modes]] §1 for the 4 specific bugs Suna shipped here.

## Verification discipline

- "Green CI" proves it compiles / bundles. It does NOT prove:
  - Runtime types resolve (the api Dockerfile doesn't typecheck).
  - The container boots.
  - The proxy / auth chain still routes.
  - i18n keys exist in all locales.
  - UI renders without console errors.
- After ANY deploy, at minimum:
  - `curl -I` the prod URL — expect 200 / 307.
  - Check container health (`docker compose ps` via ssh, or app `/health` endpoint).
  - Skim container logs for stack traces in the first 60s after restart.
- Interactive bits (command palette, 3D, canvas, drag-drop) cannot be confirmed by curl — say so explicitly; they need a browser click-through.

## Secrets

- VPS IP, SSH keys, deploy topology → only in `icm/references/deploy-runbook.md` (gitignored).
- Never print a private key into the conversation/transcript.
- If an env var is accidentally pasted, mark it for rotation in `decisions.md` so it gets rotated next session.
