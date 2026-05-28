# Stage 06 · Shell Script / Dockerfile / Host-Exec (Layer 2)

The highest-risk surface in this codebase. Suna had **4 separate production incidents**
on shell-script code in 4 weeks. Treat any change here as load-bearing.

## When to use this stage

- You're editing a `.sh` script in `scripts/`, `core/`, or anywhere in `apps/*/scripts/`.
- You're editing a Dockerfile.
- You're writing Node/TS code that builds a string passed to `docker exec`, `ssh`, `child_process.exec`, or any shell.
- You're editing `docker-compose.yml` or `Caddyfile` (less risk, but same rigor).

## Inputs

- **L3 reference: `../../references/claude-failure-modes.md` §1 — READ IN FULL. Every subsection is a real bug Suna shipped.**
- L3 reference: `../../references/architecture.md` (deploy topology — host vs container)
- L3 reference: `../../references/quality-gates-and-deploy-safety.md` (§3 health-probe minimum, §4 observability without pegging the VPS — Charity Majors / Gregg USE method, §5 single-host blue/green pattern)
- L3 reference: `../../references/stack/backend.md` (if editing the api Dockerfile — multi-stage pnpm workspace symlink handling)
- L4 working: the script / Dockerfile / exec-call you're editing

## Process

1. **Identify which shell runs your code**:
   | Where it runs | Shell | Notes |
   |---|---|---|
   | VPS host (Ubuntu/Debian) | **dash** (`/bin/sh`) | NO `pipefail`, NO `[[ ]]`, NO arrays |
   | Inside `kortix/computer` container | depends on image | check `SHELL` in the Dockerfile |
   | Inside `bun` Dockerfile | `bash` (Debian slim usually has bash) | But explicit `#!/bin/bash` shebang |
   | GitHub Actions `run:` step | `bash` (default on ubuntu-latest) | OK to use bashisms here |
   | `child_process.exec` from Node | platform default (`sh` on linux) | Same as VPS host |

2. **For shell scripts**: write POSIX-safe by default. If you NEED bash, add `#!/bin/bash` and verify the host has bash on the path.

3. **For host-exec strings (Node/TS → docker exec / ssh)**:
   - Single-quote the inner command: `` `docker exec ${id} sh -lc '...'` ``
   - Verify `$(...)` lands in the container, not the host (mental model: count the quoting layers).
   - For value comparisons: `[ "x$ACTUAL" = "xLITERAL" ]` (the `x` prefix prevents empty-substitution edge cases).
   - For fixed-string grep with `/+=` chars: `grep -qF`, not `grep -q`.
   - Use real newlines (`\n` in template literal) for multi-line scripts, not `; `.

4. **For Dockerfiles**:
   - Multi-stage: be explicit about what gets copied across stages. pnpm symlinks DO NOT survive multi-stage copy reliably (see `apps/api/Dockerfile` lines 71-77 for the `agent-tunnel` workaround pattern).
   - `--shamefully-hoist` flattens node_modules and avoids the symlink problem at install time, but transitive workspace deps may still need explicit handling.
   - Run as non-root user when possible (`USER bun`).
   - Pre-create runtime data dirs with the right owner before dropping privileges (Bun's `EACCES` on `.kortix-data` was a Suna boot bug; the current Dockerfile fixes it).

5. **Test before shipping**:
   - For shell scripts ON the VPS: test with `dash`, not just `bash`. `dash -c "$(cat script.sh)"`.
   - For docker-exec strings: copy the string to a terminal, run it manually against a test container, verify each subshell ran in the right layer.
   - For Dockerfile changes: `docker build` locally. Then `docker run` and verify the boot path.

6. Ship via Stage 01 (branch → CI → deploy).

## Outputs

- The edited file(s), merged + deployed.
- Any new shell-portability gotcha encountered → append to `claude-failure-modes.md` §1.

## Verify

- [ ] Script tested with the correct shell (dash for host, bash for explicit `#!/bin/bash`)
- [ ] All `$(...)` evaluate on the intended layer (host vs container)
- [ ] No `pipefail` / `[[ ]]` / arrays / `set -o ...` in scripts that hit `/bin/sh`
- [ ] Multi-line scripts use newlines, not `; ` joiners
- [ ] Fixed-string greps use `-F`
- [ ] Dockerfile: workspace deps that pnpm symlinks get explicit copy where needed
- [ ] Container boots; first 60s of logs clean
- [ ] Recovery / restart functions NOT called from read-ish paths ([[claude-failure-modes]] §4)
