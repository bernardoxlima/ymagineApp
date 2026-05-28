# Stage 05 · CI Repair (Layer 2)

When a workflow is failing or behaving wrong. Diagnose the WORKFLOW, not the app code,
unless the workflow is correctly catching an app bug.

## Inputs

- L3 reference: `../../references/ci-cd-map.md` (which workflow fires when; what each gate catches)
- L3 reference: `../../references/claude-failure-modes.md` §8, §9 (wrong CI gate / wasted CI patterns)
- L4 working: link to the failing GitHub Actions run, or the symptom (e.g. "deploy didn't fire on push")

## Process

1. **Read the failing run end-to-end.** Don't assume — read the actual log. Note: which job, which step, which line of stderr.
2. **Classify the failure**:
   - **App-code regression** — the gate is doing its job. Stop here; route to Stage 01 (fix the code).
   - **Workflow misconfiguration** — wrong tool, wrong flag, missing dep. Continue.
   - **Infra flake** — runner timed out / network blip. Re-run before rewriting.
3. **For workflow misconfiguration**:
   - Branch `ci/<short-desc>`.
   - Make the SMALLEST change that fixes the gate. Don't refactor the workflow.
   - Test by pushing the branch — let the workflow itself run on the change.
   - Suna patterns to remember:
     - `tsc --noEmit` is too noisy for `apps/api` (~36 tolerated errors). Use `bun build --outdir` instead.
     - `bun build --outfile` fails on multi-chunk graphs → use `--outdir`.
     - dash vs bash: any inline `run:` step that uses bash features (`[[ ]]`, arrays, `pipefail`) needs `shell: bash` explicitly, or rewrite for POSIX.
     - Path filters: if the change you expected to fire didn't, audit the `paths:` block on the workflow.
4. **For "deploy didn't fire"**:
   - Check the workflow's `on.push.paths` — did your change touch any?
   - Check `concurrency.cancel-in-progress` — was a parallel push cancelling yours?
   - Check repo vars (`vars.AUTO_DEPLOY_DEV` etc.) — gated workflows can silently no-op.
   - Check branch protection — required checks might be holding up the merge that would trigger deploy.

## Outputs

- The fixed workflow file, merged.
- If the issue was App-side, route to Stage 01 with a note on what the gate caught.

## Verify

- [ ] The failing workflow goes green on the fix PR (the workflow itself runs as part of the test).
- [ ] Other workflows that share the changed file (e.g. shared composite actions) still work.
- [ ] If you added a new gate, it actually catches the bug class you intended (test it by writing a tiny intentional failure in a follow-up PR, see it fail, revert).
- [ ] `ci-cd-map.md` updated if the workflow's behavior changed (paths, jobs, gates).
