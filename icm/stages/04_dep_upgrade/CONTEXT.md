# Stage 04 · Dependency / Framework Upgrade (Layer 2)

For framework jumps (Next/React) or risky dep bumps. **Suna's Next 15→16 + React 18→19
upgrade is our worked example** — see [[decisions]] D-004 for the exact change list.

## Inputs

- L3 reference: `../../references/architecture.md` (what depends on what; build config)
- L3 reference: `../../references/conventions.md` (lockfile + CI gate discipline)
- L3 reference: `../../references/decisions.md` D-004 (the concrete Next 15→16 worklist from Suna)
- L3 reference: `../../references/claude-failure-modes.md` §2 (Bun + missing exports — relevant if bumping packages/db)
- L3 reference: `../../references/deploy-runbook.md` ⚠ (rollback) — load at merge/deploy step
- L4 working: the target versions / upgrade goal

## Process

1. **Research first** — fetch the official upgrade guide. For multi-package bumps, dispatch parallel agents to:
   (a) grep the codebase for every breaking API,
   (b) check each dependency's compat (peer deps, Turbopack, React version),
   (c) pull current versions with `npm view <pkg> version` — don't guess.
2. **Branch** `chore/<upgrade>` from `main`.
3. **Edit** package.json(s) + root `pnpm.overrides` (for transitive deps like `@types/react`) + config files (next.config.ts, tsconfig).
4. **Apply the lessons from Suna**:
   - Bump core + things that break at runtime; leave peripheral deps unless they break (react reactively).
   - For Next 16: drop `webpack:` key from `next.config.ts`, rename `middleware.ts` → `proxy.ts`, handle Konva via `turbopack.resolveAlias`.
   - For React 19: bump `@types/react` + `@types/react-dom` in BOTH `apps/web/package.json` AND root `pnpm.overrides` (Suna missed the root override on first attempt).
   - Leave `fumadocs` at current version unless it actually breaks.
5. **Lockfile** — `pnpm install --lockfile-only` (no native compile on Windows; regenerates `pnpm-lock.yaml`). Required for CI `--frozen-lockfile`.
6. **CI gate** — push, open PR → `ci-build` green in real env (Windows local build is unreliable; canvas native dep + bun differences). Iterate on failures.
7. **Merge → deploy → verify** prod (Stage 01 tail). Confirm container boots clean (no "Export not found", no React-version-mismatch warnings).

## Outputs

- Upgraded branch, merged + deployed.
- `decisions.md` updated with what/why + what was left out + new versions of record.

## Verify

- [ ] Lockfile resolves (no missing versions, no peer-dep warnings that are actually errors)
- [ ] `ci-build` green (not local — Windows is unreliable here)
- [ ] Prod 200 + clean boot logs + proxy/auth still works
- [ ] React 19 peer-dep cascade resolved (cmdk, react-day-picker, etc. — Suna's list in [[decisions]] D-004)
- [ ] Rollback SHA noted; runtime-only behaviors (3D / canvas / cmdk command palette) flagged for browser check
