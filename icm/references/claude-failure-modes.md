# Claude Failure Modes (Layer 3 — reference, committed)

> **Read this BEFORE coding.** These are bugs Claude shipped in the sister `DenisCDev/suna`
> repo (same stack as ymagineApp). Each one cost a deploy, a rollback, or a user-visible
> incident. The fix patterns are below. Don't repeat them.
>
> Source: forensic reading of `DenisCDev/suna` commit log (~30 incidents over the
> Kortix → Ymagine port, 2026-04 → 2026-05). Categories are ordered by impact.

---

## §1 — Shell scripts: bash assumptions, quoting through layers

The single highest-incident category. 4 separate prod-impacting bugs in Suna, all in code
that constructs shell commands and runs them through `docker exec` or `ssh`.

### §1.1 — `set -o pipefail` is bash-only; `/bin/sh` is dash on Debian/Ubuntu

```sh
# WRONG — Suna shipped this; dash exits 'Illegal option -o pipefail' (exit 2)
# Combined with a 20-retry × 5s loop = ~100s frontend hang before erroring.
sh -c 'set -eu -o pipefail; ...'

# RIGHT
sh -c 'set -eu; ...'    # if no real pipes, just drop it
```

Apply: any script that ships to the VPS host. The VPS is Ubuntu/Debian; `/bin/sh` is dash.

### §1.2 — Multi-line scripts joined with `; `

```sh
# WRONG — Suna shipped this; produces 'for i in ...; do;  systemctl ...' which is invalid syntax
const recovery = [
  'for i in 1 2 3',
  'do',
  '  systemctl restart foo',
  'done',
].join('; ');

# RIGHT — use real newlines (in a Bash here-doc or template literal with \n)
const recovery = `for i in 1 2 3; do
  systemctl restart foo
done`;
```

The `do;` empty statement is the giveaway. Test the joined string in a shell before shipping.

### §1.3 — Quoting through `sh -lc` → host vs container confusion

The killer bug. When you write a Node/TS template literal containing `"` to pass to
`sh -lc "..."` over `docker exec`, the `"` characters break the outer quoting, and `$(...)`
inside expands on the **wrong layer** (host instead of container).

```ts
// WRONG — Suna's verifyPublicKeyViaHostExec used \" inside the template:
const cmd = `docker exec ${id} sh -lc "test \"$(stat -c %a /file)\" = \"600\""`;
// → host shell sees: sh -lc "test  = 600" (busted quoting, $(stat) ran on the HOST)
// → host doesn't have /file → 'stat: cannot statx' → test fails with '=: unexpected operator'

// RIGHT — single-quote the inner command so $(...) survives to the container shell:
const cmd = `docker exec ${id} sh -lc 'test "x$(stat -c %a /file)" = "x600"'`;
// Use [ "xACTUAL" = "xLITERAL" ] so empty substitution doesn't retrigger =-as-operator.
```

Apply: any code that builds `docker exec sh -lc` or `ssh host "..."` strings.
Always sanity-check WHERE each subshell `$(...)` will execute.

### §1.4 — `grep` with paths containing special chars

```sh
# WRONG — keyData has /+= chars, breaks regex interpretation
grep -q "$keyData" /file

# RIGHT — fixed-string match
grep -qF "$keyData" /file
```

---

## §2 — "Bun doesn't typecheck → boot crashes on missing exports"

`apps/api` runs `bun run src/index.ts` directly. No compile step. **A missing or unresolved
export takes the production container down at boot.** Local dev hides this because nothing
forces the full module graph to resolve.

```ts
// Suna's incident: packages/db barrel re-exported tables by NAME (not `export *`).
// Someone added authors/authorSources/sourceChunks/agentAuthors to the schema
// but forgot the barrel re-export. tsc would have caught it. Docker build didn't run tsc.
// → api crashed at boot in prod: "Export named 'sourceChunks' not found"
```

**Fix pattern**:
1. CI `ci-build.yml` runs `bun build apps/api/src/index.ts --outdir /tmp/_check` on every PR.
   `bun build` resolves the entire module graph and fails on link errors — it's a boot-safety
   gate without doing full typecheck (the API has ~36 tolerated pre-existing type errors).
2. **Do NOT use `tsc --noEmit` on `apps/api`** — too noisy, would block every PR.
3. When adding a new table / type / function to `packages/*`, update the barrel export
   in the same commit.

`apps/web` is different: `next build` does run, and `typescript.ignoreBuildErrors: true`
means types are ignored at build but the bundler still link-checks. Missing exports there
fail the build directly.

---

## §3 — Writing files into the wrong runtime boundary

Suna's most catastrophic single bug: writing a workspace tool that imported a module the
workspace runtime couldn't resolve. The unhandled rejection **aborted every agent's
response**. No agent in the workspace could reply.

```ts
// WRONG — wrote .opencode/tool/*.ts that does:
import { plugin } from '@opencode-ai/plugin';
// The workspace runtime cannot resolve @opencode-ai/plugin → unhandled rejection
// → all agent replies abort

// RIGHT — choose the right surface:
// - The runtime image's tools/ directory (built into kortix/computer)
// - An MCP server
// - A self-contained tool with `import` only of node builtins + env via process.env
```

**Mental model**: there are 3 distinct execution boundaries in this codebase:

| Boundary | Available imports | Examples |
|---|---|---|
| **Workspace** (`.opencode/tool/*.ts` written to a sandbox at runtime) | Node builtins + `process.env` only | per-agent custom tools |
| **Runtime image** (`core/kortix-master/opencode/tools/`) | Anything bundled into `kortix/computer` | canonical OpenCode tools |
| **API / web** (`apps/api/src/`, `apps/web/src/`) | `@kortix/shared`, `@kortix/db`, npm deps | normal app code |

Before writing a file, ask: which boundary does this execute in, and which imports survive there?

---

## §4 — `ensureRunning` / "recover" functions on read-ish paths

```ts
// Suna's incident: setupJustavpsSSH() awaited provider.ensureRunning(externalId).
// ensureRunning ran recoverHostWorkload(): systemctl restart justavps-docker +
//   three wait loops (240s each) × 20 retries = worst case ~1 hour.
// → SSH key injection (a READ-ish operation) force-restarted the workload every click.
// → flaky daemon? Sandbox appeared "off" to users.
```

**Pattern to avoid**: don't call heavy "ensure healthy" recovery from paths that just
need a healthy container to already exist. Check `machine.status === 'ready'` cheaply,
then do the actual work with a bounded retry loop. Reserve `ensureRunning` for
explicit recovery endpoints and admin queues.

---

## §5 — Schemas / enums diverging between layers

```ts
// Suna's incident: Zod schema accepted ENV_MODE: 'local' | 'cloud'
// docker-compose.yml had ENV_MODE=production
// → app rejected config at boot
```

When you change an enum / Zod schema / DB column with a CHECK, **grep the whole repo**
for every place the old value appears: docker-compose, k8s manifests, CI env, .env.example,
client-side validators, tests, Caddyfile, deploy-* workflows.

Other instance of this pattern in Suna: PDF text extraction yielded NUL bytes + UTF-16
lone surrogates that Postgres TEXT rejects. The schema accepted "text"; the data wasn't
actually text. Sanitize at the boundary.

---

## §6 — Tab / route / page renderers driven by a map you didn't update

```ts
// Suna's incident: PAGE_COMPONENTS map had /agents → WorkspacePage
// (a speculative leftover from when /agents was just an anticipated route).
// New /agents page was added but never wired into the map.
// → clicking the sidebar Agents entry showed Workspace ("Novo agente"), nav appeared broken.
```

When adding a route or tab, search for the routing map (often a single `Record<string, …>`
in a registry file like `menu-registry.ts` or `PAGE_COMPONENTS`) and update it in the
**same commit** as the route addition.

### §6.1 — A new DYNAMIC `(dashboard)` route needs THREE registrations, not one (D-022)

Shipped this in the multi-project restore. The `(dashboard)` group is a TAB SYSTEM: the
catch-all + `layout-content.tsx` decide what to render via `resolveTabFromPathname()`, and
tab content is rendered by `PageTabContent` → `resolveComponent(href)` (a map of href → lazy
component). A bare Next `page.tsx` is NOT enough — adding `app/(dashboard)/projects/[id]/page.tsx`
alone gave a literal **"Page not found"** (from `PageTabContent` when `resolveComponent`
returns null) even though the route built fine and the page existed.

A new dynamic `(dashboard)` route needs all THREE, in the same commit:
1. `app/(dashboard)/<route>/[id]/page.tsx` — the page. Read params as a **PROP via `use()`**
   (`function Page({ params }: { params?: Promise<{id}> }) { const {id}=use(params)... }`),
   NOT `useParams()` — `PageTabContent` renders it as `<Component params={promise}/>`, not as
   the matched route, so `useParams()` is empty. Mirror `app/(dashboard)/tasks/[id]/page.tsx`.
2. `lib/tab-route-resolver.ts` — a dynamic resolver matching `/^\/<route>\/([^/]+)$/`
   returning a `TabDescriptor` (`type: 'page'`).
3. `components/tabs/page-tab-content.tsx` — a lazy import + a `resolveComponent` case
   returning `{ Component, params: { id } }`.

Static routes only need the `PAGE_COMPONENTS` + `STATIC_TAB_ROUTES` entries. Symptom of a
miss: the page works as a file but the app shows "Page not found" on direct load **and** on
sidebar click.

---

## §7 — Happy-path features that forget existing data

Repeated Suna pattern: ship a feature for new objects, forget about objects that pre-exist.

- "Authors are now also agents" → existing authors had no agent → had to add a "Criar agente" action + auto-provision retry path.
- Creating an agent → didn't invalidate the agents react-query → new agent didn't show in selector until a hard reload.
- Magic-link auth set as default → SMTP wasn't configured → no one could sign in → had to flip to password auth as default.

When shipping a feature, ask: (a) what happens for objects created BEFORE this feature?
(b) what client-side caches need invalidation? (c) does this depend on an env / service
that isn't configured in prod?

---

## §8 — Wrong CI gate (too noisy → ignored; or wrong tool for the check)

```yaml
# Suna shipped tsc --noEmit on apps/api — 36 pre-existing tolerated errors,
# never green, blocked every PR → had to be reverted.
# Replacement: bun build --outdir (resolves graph without typechecking).

# Then: bun build --outfile failed because graph has dynamic-import split points
# → multi-chunk output → --outfile doesn't accept that. Switch to --outdir.
```

Pick the CI gate that catches the actual bug you care about. For `apps/api`:
- ❌ `tsc --noEmit` — too noisy, blocks unrelated PRs.
- ❌ `bun build --outfile` — fails on multi-chunk graphs.
- ✅ `bun build --outdir` — resolves the graph, fails on missing exports, doesn't typecheck.

---

## §9 — Wasted CI: rebuild everything every push

```yaml
# Suna shipped a deploy that rebuilt BOTH api AND frontend on every push to main.
# Frontend build ~4min → wasted on backend-only PRs.
# Fix: dorny/paths-filter job, gate build-api / build-frontend on which paths changed.
```

ymagineApp's `deploy-dev.yml` already does this. `deploy-hostinger.yml` should too —
audit it next time you touch it.

---

## §10 — Deploy-time secrets / keys pasted in chat

```
# Suna's OPENROUTER_API_KEY was pasted into a chat once → forever marked for rotation in
# decisions.md. The whole-key value lived briefly in someone's transcript log.
```

If you need a secret value to debug:
- Ask the operator to paste it directly into the VPS file (`nano /root/.kortix/.env`), not into the chat.
- If a secret is accidentally pasted to chat, record it in `decisions.md` so it gets rotated next session.

---

## §11 — Assuming infra topology instead of checking it (D-022)

Burned hours this session assuming the prod sandbox ran on JustAVPS (the cloud path). It
does NOT: the Hostinger self-hosted deploy runs the sandbox as a **LOCAL docker container**
(`kortix-hosted-sandbox`, provider `local_docker`) ON the VPS — `docker ps` shows it next to
api/frontend/supabase. Before reasoning about sandbox/deploy, CHECK:
- `apps/api/src/config.ts` → `ALLOWED_SANDBOX_PROVIDERS` (this deploy = `local_docker`) and `SANDBOX_IMAGE`.
- `docker ps` on the VPS — is the sandbox a local container or remote?

Three deploy truths learned here (corrects/extends `architecture.md`):
- **`NEXT_PUBLIC_*` is BUILD-TIME** — baked into the JS bundle by `next build`. You cannot
  flip it via `docker exec`/runtime env; it needs a frontend rebuild (the flag lives in
  `deploy-hostinger.yml`'s build step). Don't try to "fix" a `NEXT_PUBLIC_*` flag on the host.
- **`core/` does NOT deploy via `deploy-hostinger`** (its paths are apps/api, apps/web,
  packages, supabase, the workflow). The sandbox image is a separate pipeline. The fork CAN
  build its OWN sandbox image to **GHCR with the built-in `GITHUB_TOKEN`** — no Docker Hub
  creds — via `.github/workflows/build-sandbox-image.yml`, then point the api's `SANDBOX_IMAGE`
  at `ghcr.io/<owner>/ymagineapp-computer:<tag>`. (deploy-dev builds `kortix/computer` too but
  its Docker Hub creds were missing + its frontend build OOMs — abandoned path.)
- The sandbox `/workspace` is a **named volume** (`kortix-sandbox-data`) → recreating the
  container on a new image PRESERVES user data. `docker rm` (without `-v`) keeps it.

### §11.1 — Secrets in shell commands + logs (security review caught this)

When building a `docker login`/exec command with a token: **shell-escape** the value (use
`shellEscape()` from justavps.ts; for dockerode pull pass `authconfig`, not a command string)
AND **never log the raw error** (`console.warn(..., err)`) — it can carry the token-bearing
command. Use `--password-stdin`; log a sanitized message only. Gotcha: `/root/.docker/config.json`'s
`ghcr.io` auth may be a STALE CI `GITHUB_TOKEN` from a deploy's `docker login` (~400 chars),
NOT the operator's PAT — don't extract it expecting a ~40-char PAT.

---

## Quick pre-commit checklist (use before every PR)

- [ ] Did you change any shell script / Dockerfile / host-exec string? → re-read §1.
- [ ] Did you add an export to `packages/db` or `packages/shared`? → barrel updated? (§2)
- [ ] Did you add a tool / file to a sandbox runtime? → which boundary? (§3)
- [ ] Did you add a route / tab / nav entry? → routing map updated? (§6)
- [ ] Did you add a DYNAMIC `(dashboard)` route? → page.tsx + tab-route-resolver + page-tab-content, params read as a prop via `use()`? (§6.1)
- [ ] Did you ship a feature for new objects? → migration plan for existing data? (§7)
- [ ] Did you change an enum / Zod schema? → grep for every place the old value lives? (§5)
- [ ] Is the CI gate appropriate for what you actually want to catch? (§8)
- [ ] Are any secret values in your diff, in a shell command, or in a log line? (§10, §11.1)
- [ ] Reasoning about sandbox/deploy? → checked `ALLOWED_SANDBOX_PROVIDERS` + `docker ps` on the VPS; remember `NEXT_PUBLIC_*` is build-time and `core/` ships via the sandbox image, not `deploy-hostinger` (§11)
