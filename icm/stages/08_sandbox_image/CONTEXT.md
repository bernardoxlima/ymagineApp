# Stage 08 · Sandbox Image — build + ship `kortix/computer` (Layer 2)

The **separate, non-obvious deploy pipeline**. Anything under `core/` (the sandbox runtime
— `kortix-master`, opencode config, the `kortix/computer` Dockerfile) does **NOT** reach the
running sandbox via `deploy-hostinger`. It ships as a Docker IMAGE through its own path. This
stage exists because that path cost a full session to discover the first time (D-022).

## When to use this stage

- You changed `core/kortix-master/**` (the in-sandbox `/kortix/*` API, ticket/project logic, plugin).
- You changed `core/docker/**` (the sandbox image build).
- You need a sandbox-backend behavior change to take effect on the **running** sandbox.

If you're only changing `apps/api` / `apps/web`, use Stage 01 — those deploy via `deploy-hostinger`.

## Inputs

- **L3 reference: `../../references/claude-failure-modes.md` §11 — READ IN FULL** (topology, build-time vs runtime, secrets in shell).
- L3 reference: `../../references/architecture.md` (Sandbox / `core/` section — provider paths, volumes).
- L3 reference: `../../references/decisions.md` D-022 (the worked example: GHCR image → SANDBOX_IMAGE → recreate).
- L3 reference: `../../references/deploy-runbook.md` (⚠ gitignored — VPS host, SSH key, sandbox container name).
- L3 reference: `../../references/ci-cd-map.md` (`build-sandbox-image.yml` row).
- L4 working: the `core/**` file(s) you're editing.

## Process

1. **Internalize the topology** (don't re-discover it):
   - Prod sandbox = LOCAL docker container `kortix-hosted-sandbox` on the VPS (provider `local_docker`), NOT JustAVPS.
   - `/workspace` = named volume `kortix-sandbox-data` (survives recreate). `/ephemeral/kortix-master/` = the runtime (replaced on image update). User data is safe across a recreate.
   - The api picks the image from `config.SANDBOX_IMAGE` (set in `/root/.kortix/.env`).

2. **Make the code change** in `core/kortix-master`. Gate behavior changes behind the relevant
   flag (`config.PROJECTS_ENABLED` etc.) so single-workspace deployments are unaffected when off.

3. **Syntax-check locally** — `ci-build` does NOT cover `core/`. Bun runs the TS directly, so a
   syntax error crashes the sandbox at boot:
   `bun -e 'new Bun.Transpiler({loader:"ts"}).transformSync(await Bun.file("<path>").text())'`

4. **Build the image to GHCR** (no Docker Hub creds needed — uses `GITHUB_TOKEN`):
   - The workflow must be on `main` to dispatch: `gh workflow run build-sandbox-image.yml --ref main -f tag=<tag>`.
   - Produces `ghcr.io/<owner>/ymagineapp-computer:<tag>`.
   - ~5GB image, ~20-40 min build. The build job frees disk + checks out submodules (`kortix-ocx-registry`).

5. **Point the api at the image** (on the VPS, via SSH — see runbook for host):
   - `SANDBOX_IMAGE=ghcr.io/<owner>/ymagineapp-computer:<tag>` in `/root/.kortix/.env`.
   - For a PRIVATE image: also `GHCR_PULL_USER=<gh-user>` + `GHCR_PULL_TOKEN=<read:packages PAT>`.
     The api authenticates the pull (justavps cloud-init / update-executor / local-docker `authconfig`).
     Never paste the token in chat — set it in the VPS `.env` directly.

6. **Recreate the sandbox** on the new image (data preserved by the named volume):
   - Cleanest: trigger the in-app Update, OR recreate the container reusing `kortix-sandbox-data`
     + `--env-file` from the existing container (+ `KORTIX_PROJECTS_ENABLED=true` if the feature needs it).
   - Set the durable flag too: `printf true > /persistent/.kortix-projects-enabled` inside the sandbox.

7. **Verify** end-to-end (the sandbox API needs auth):
   `docker exec kortix-hosted-sandbox sh -c "curl -fsS -H \"Authorization: Bearer \$INTERNAL_SERVICE_KEY\" http://localhost:8000/<endpoint>"`

## Outputs

- The GHCR image, `SANDBOX_IMAGE` updated, sandbox running the new image, verified live.
- New gotcha encountered → append to `claude-failure-modes.md` §11.
- Significant behavior/architecture change → record in `decisions.md`.

## Verify

- [ ] `core/` change syntax-checked with Bun (ci-build does NOT cover `core/`)
- [ ] Behavior change gated behind the right flag (single-workspace unaffected when off)
- [ ] Image built + pushed to GHCR (`build-sandbox-image.yml` green)
- [ ] `SANDBOX_IMAGE` (+ `GHCR_PULL_USER`/`GHCR_PULL_TOKEN` if private) set in `/root/.kortix/.env`
- [ ] Sandbox recreated on the new image; `/workspace` data intact (named volume reused)
- [ ] Sandbox `/kortix/health` 200 + the changed endpoint verified with the internal token
- [ ] No secret pasted in chat ([[claude-failure-modes]] §10, §11.1)
