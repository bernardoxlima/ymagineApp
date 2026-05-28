# Stage 01 · Ship a Feature (Layer 2)

Default path for any code change. Sequential, human-reviewed, ends in a verified prod deploy.

## Inputs

- L3 reference: `../../references/claude-failure-modes.md` (read §1–§7 minimum; full read if you're touching shell/api boundaries)
- L3 reference: `../../references/architecture.md` (where the code lives, services, boundaries)
- L3 reference: `../../references/conventions.md` (PT-BR, git flow, verification discipline)
- L3 reference: `../../references/ci-cd-map.md` (which workflow your change triggers)
- L3 reference: `../../references/deploy-runbook.md` ⚠ (deploy + rollback) — load only at the deploy step
- L4 working: the feature request / bug description from the user

## Process

1. **Discuss** — clarify scope. Non-trivial? plan first. Find the existing pattern to follow (don't invent abstractions). Re-skim relevant §s of `claude-failure-modes.md` for this change type.
2. **Branch** — `feat/…` or `fix/…` or `chore/…` from `main`. NEVER edit on `main`.
3. **Implement** — follow conventions.md. PT-BR for user-facing strings. Run the pre-commit checklist (§ end of `claude-failure-modes.md`).
4. **CI gate** — push branch, open PR → **`ci-build` must go green** (real Linux/Node22 build resolves the module graph). Iterate on failures.
5. **Merge** — only after green. `gh pr merge --merge`.
6. **Deploy** — merge to `main` auto-triggers `deploy-hostinger`. Watch it complete.
7. **Verify (prod)** — see Verify section below. Interactive bits → say they need a browser.

## Outputs

- Merged PR + deployed image; short summary of what changed + verification result.
- Any plan / notes / debug scratch → `../../output/` (gitignored).

## Verify (cross-check before calling done)

- [ ] `ci-build` green on the PR (not just local — local Windows builds are unreliable for canvas-native deps)
- [ ] `deploy-hostinger` workflow completed (green) on the merge commit
- [ ] Prod URL returns 200/307 (`curl -I https://<prod-host>`)
- [ ] API `/health` (or equivalent) returns OK
- [ ] Container logs clean in the first 60s (no stack traces — especially "Export named '...' not found")
- [ ] Rollback SHA noted in case of runtime regression
- [ ] If UI/interactive: flagged as "needs browser confirmation" (curl doesn't prove it works)

## Common landmines on this path

| Symptom | Likely cause | Fix path |
|---|---|---|
| `ci-build` red on `bun build` | Missing barrel export in `packages/db` or `packages/shared` | Add the export; same commit as the new schema/type |
| `ci-build` red on `next build` | Frontend link error (often peer-dep mismatch after a dep bump) | Resolve the version; re-run install |
| Deploy green but container restarting | Missing env var on VPS, or migration failed | SSH to VPS, `docker compose logs api` |
| Nav entry doesn't appear after merge | Forgot to update the route/tab registry | [[claude-failure-modes]] §6 |
| Existing-data backfill missing | Happy-path feature didn't account for objects created before | [[claude-failure-modes]] §7 |
