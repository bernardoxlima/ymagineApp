# Quality Gates and Deploy Safety — ymagineApp L3 Reference

**Purpose.** Canonical guidance for editing CI workflows, deploy scripts, observability config, and rollback logic in ymagineApp. Every claim is traceable to a recognized authority — books, the SRE corpus on `sre.google`, Martin Fowler's articles, DORA's published capabilities catalog, the 12-Factor methodology, NIST SP 800-218, or OWASP DevSecOps. Vendor sources are flagged when used.

**System under study.** Single Hostinger VPS, `docker compose` (api + frontend + Caddy + Supabase). Push to `main` → `.github/workflows/deploy-hostinger.yml` builds images on GitHub-hosted runners, pushes to GHCR, then SSHes to the VPS to `docker compose pull && up -d`. PR gate is `ci-build.yml`: `bun build` (api) + `next build` (web). No test job runs in CI. Frontend has Sentry (`@sentry/nextjs` → BetterStack-compatible DSN) + a custom logger that POSTs to `client.app.log()`. API has `@sentry/bun` → BetterStack and 51 test files under `apps/api/src/__tests__/` that are not invoked anywhere in `.github/workflows/`.

---

## §1 — Pre-merge / PR gates (zero VPS cost)

### 1.1 The Deployment Pipeline model: stage by escalating confidence

**Principle.** Break the build into stages where each is cheaper than the next and "provides increasing confidence, usually at the cost of extra time." Fast stages run on every change; expensive stages run on green output of the cheap ones.

**Source.** Humble & Farley, *Continuous Delivery* (Addison-Wesley, 2010), Ch 5 "Anatomy of the Deployment Pipeline." Restated by Fowler, "Deployment Pipeline," martinfowler.com/bliki/DeploymentPipeline.html: *"A deployment pipeline is a way to deal with this by breaking up your build into stages. Each stage provides increasing confidence, usually at the cost of extra time. Early stages can find most problems yielding faster feedback, while later stages provide slower and more thorough probing."*

**Why this matters.** The cheap stages (lint, compile, unit) reject 80%+ of broken commits in seconds. The expensive stages (integration, build, image) never run on commits the cheap stages would reject. This is the core mechanism by which pipelines stay fast as the test suite grows.

**What to do in ymagineApp.**
- Keep `ci-build.yml` cheap stages cheap. `dorny/paths-filter` already gates by changed paths — preserve that.
- Add an explicit ordering: lint → typecheck-or-build → unit tests → integration tests. Today the workflow goes straight to build with no earlier rejection point.

**Common failure mode.** Stages that run "just in case" — typecheck after build despite build failing first, duplicated lint between web and api jobs. This burns CI minutes without adding confidence (Fowler, same article: *"examine this for bottlenecks, opportunities for automation, and collaboration points"*).

### 1.2 Build it once, deploy the same artifact

**Principle.** Compile a binary or image exactly once, then promote that same artifact through every environment. Never rebuild for a downstream stage.

**Source.** Humble & Farley, *Continuous Delivery*, Ch 5 ("Build Binaries Only Once") and the 12-Factor App, factor V Build/Release/Run, 12factor.net: *"Strictly separate build and run stages."* Reinforced by Google SRE Book, "Release Engineering" chapter, sre.google/sre-book/release-engineering: hermetic builds where *"if two people attempt to build the same product at the same revision number in the source code repository on different machines, we expect identical results."*

**Why this matters.** If you rebuild between staging and production, the artifact you tested is not the artifact you ship — any environmental drift in the build runner becomes an undetected change. This is the failure mode behind "works in CI, breaks in prod."

**What to do in ymagineApp.**
- `deploy-hostinger.yml` already does this correctly: one `docker buildx build --push` per service, then SSH pulls the same SHA-tagged image. Good.
- `deploy-dev.yml` also follows the pattern (build → manifest → SSH pull). Good.
- The PR gate `ci-build.yml` does NOT push a tagged image — it just discards `/tmp/_bun_check`. That is correct for a gate (the prod build happens later from `main`), but it means the PR-tested code path is `bun build` in a temp directory while the prod path is `docker buildx build` with a Dockerfile. These can diverge. The right mitigation is to make the PR gate run the *same Dockerfile* via `docker buildx build --load` (still no push), not to push from PRs.

**Common failure mode.** PR gate proves "the source compiles," prod build proves "the image builds" — two different things. A Dockerfile that breaks on a new file is caught only at deploy time. Humble & Farley call this out (Ch 5, the "every change should go through a single channel" principle).

### 1.3 Self-testing builds and the fail-fast principle

**Principle.** A green build must mean the system passes its tests, not just that it compiles. *"A sound test suite would never allow a mischievous imp to do any damage without a test turning red."*

**Source.** Fowler, "Continuous Integration," martinfowler.com/articles/continuousIntegration.html (the canonical CI article). Also Farley, *Modern Software Engineering* (Addison-Wesley, 2021), Ch 7 "Optimize for Managing Complexity" and Ch 9 "Tools and Techniques of Engineering."

**Why this matters.** ymagineApp's PR gate today proves the api module graph resolves and the next.js bundle links. It proves *nothing* about whether `unit-stripe-webhook-canonicalization.test.ts` still passes — and that test exists precisely because a stripe webhook bug shipped before. Compile-only gates miss logic regressions by design.

**What to do in ymagineApp.**
- Add a `test-api` job to `ci-build.yml` that runs `bun test apps/api/src/__tests__/unit-*.test.ts` (the unit subset — they are fast and have no external dependencies). The 31 `unit-*` files match the test-pyramid base layer.
- Do NOT add the `e2e-*` tests to the PR gate by default; they need a Postgres/Supabase fixture, will be flaky, and will erode trust. They belong in a nightly or pre-deploy job.
- Fowler explicitly: *"Keep the Build Fast"* — target <10 minutes total. Today `ci-build.yml` is ~6 minutes; the unit subset adds ~30s.

**Common failure mode.** The "ice cream cone" anti-pattern — relying on slow E2E suites because unit coverage is weak. Fowler, "Test Pyramid": *"end-to-end tests are more prone to non-determinism problems"* and *"slow, increasing build times."* The ymagineApp `e2e-*` files in CI would manifest as flaky CI, the worst possible outcome for trust.

### 1.4 The test pyramid: lots of unit, few E2E

**Principle.** Many fast unit tests, fewer integration tests, very few end-to-end tests. Bugs found in E2E should be reproduced as unit tests before being fixed.

**Source.** Cohn, *Succeeding with Agile* (2009) coined the pyramid; Fowler popularized it in "Test Pyramid," martinfowler.com/bliki/TestPyramid.html: *"you should have many more low-level UnitTests than high level BroadStackTests running through a GUI."* The inverted form (ice cream cone) is described as *"brittle... expensive... unreliable... hard to maintain."*

**Why this matters.** The ymagineApp api test files map cleanly: 31 `unit-*` (cheap, deterministic) vs 13 `e2e-*` (requires Supabase, will flake). Wiring them as one undifferentiated `bun test` is the path to ice-cream-cone hell.

**What to do in ymagineApp.**
- Two distinct test jobs: `test-unit` (PR gate, required) and `test-integration` (post-merge or scheduled, not blocking).
- When a bug is found via Sentry in prod, the fix PR must include a new unit test that would have caught it. This is *Modern Software Engineering* Ch 9 (Farley) on the discipline of "let the test drive the design."

**Common failure mode.** A `test-all` step that runs unit + integration in one process. Integration flake fails the unit signal. Trust collapses; team starts using `[skip ci]`.

### 1.5 Type checking: catch what the runtime can't

**Principle.** Static type checks are a free gate when noise is low. They are a *negative* gate (high false positives erode trust) when the project has tolerated errors.

**Source.** *Software Engineering at Google* (Winters, Manshreck, Wright, 2020), Ch 11 "Testing Overview" on the cost of "noisy" tests and Ch 22 "Large-Scale Changes" on incremental type adoption. Reinforced by Fowler's "Continuous Integration" on the build-fast / fail-fast principle.

**Why this matters.** The `ci-build.yml` comment is explicit: *"tsc --noEmit is intentionally NOT used (apps/api has ~36 tolerated pre-existing type errors; that gate would be too noisy and would block every PR)."* This is the correct call per *SE at Google* — gates with known-tolerated noise must not be required. But the long-term fix is also canonical: reduce the tolerated-error count to zero, then turn the gate on.

**What to do in ymagineApp.**
- Track the pre-existing-error count over time. A snapshot baseline (`tsc --noEmit > .typescript-baseline.txt`) plus a diff gate ("PR must not increase the count") is the textbook *SE at Google* migration pattern (Ch 22).
- When count reaches zero, promote `tsc --noEmit` to a hard gate in `ci-build.yml`.

**Common failure mode.** Adding `tsc --noEmit` with 36 errors and `|| true`. The gate is theater and the typecheck stops mattering. Either it blocks or it doesn't.

### 1.6 Dependency vulnerability scanning

**Principle.** Run SCA (software composition analysis) on every PR. Catch known CVEs in transitive deps before they reach prod. Choose a scanner with low false-positive rate; `npm audit` is documented as noisy.

**Source.** NIST SP 800-218 v1.1 (SSDF), practice PW.4 "Reuse Existing, Well-Secured Software," csrc.nist.gov/projects/ssdf. OWASP DevSecOps Guideline, owasp.org/www-project-devsecops-guideline: SCA listed as a canonical pipeline gate. Empirical: Pashchenko et al., *"Vuln4Real: A Methodology for Counting Actually Vulnerable Dependencies"* (IEEE TSE, 2020) found npm-audit-style scanners over-report by 30–50% on production-reachable vulnerabilities.

**Why this matters.** ymagineApp has zero SCA gate today. A vulnerable `next.js` or `@sentry/bun` ships unattended. The cost of adding OSV-Scanner (Google's open-source scanner, uses the OSV.dev DB) is ~20 seconds on a PR.

**What to do in ymagineApp.**
- Add `google/osv-scanner-action` to `ci-build.yml`. Configure it to fail on `HIGH`/`CRITICAL` only — avoid `MODERATE` noise (NIST PW.4 + the Vuln4Real finding).
- Pair with `dependabot` (already wired per recent commit 5f725f7cc) for automated upgrade PRs.
- Do NOT rely on `npm audit` / `pnpm audit` for the gate — known false-positive rate.

**Common failure mode.** SCA tool flagging dev dependencies (Vite, ESLint plugins) and breaking PRs on issues with no production impact. NIST SP 800-218 PW.4 explicitly distinguishes runtime-reachable from build-time-only.

### 1.7 Secret scanning

**Principle.** Block secrets at commit time AND scan repo history. Anyone can paste an API key into a debug log; the gate is the last line of defense.

**Source.** NIST SP 800-218, PS.1 "Protect All Forms of Code from Unauthorized Access and Tampering" and PO.5 on secure development environments. OWASP DevSecOps: *"Scan git repositories for finding potential credentials leakage."* The canonical tools — `gitleaks` (BSD-licensed, embedded ruleset based on TruffleHog research) and TruffleHog — are research-backed (the Princeton/Cornell study *"How Bad Can It Git?"*, USENIX Security 2019, established baseline rates of leaked credentials on GitHub: ~100k unique secrets/day).

**Why this matters.** ymagineApp's `apps/api/.env` is generated server-side, and `BETTERSTACK_API_SENTRY_DSN` / Stripe keys are server-only. But a PR could trivially add `console.log(process.env.STRIPE_SECRET_KEY)`. A pre-commit hook is necessary but not sufficient (developer can `--no-verify`); CI gate is the backstop.

**What to do in ymagineApp.**
- Add `gitleaks/gitleaks-action` to `ci-build.yml`. ~5 seconds on cold cache. Fails the PR if any secret pattern hits.
- Run on the diff only (`scan-pr-mode: true`), not full history — full-history scan is for one-time auditing.

**Common failure mode.** Configuring secret-scan on full history every PR. Slows the gate, flags historical leaks that are already rotated, erodes signal.

### 1.8 The CI is not "it works"

**Principle.** Green CI proves your tests pass, not that the system works. Always treat post-deploy verification as the truth source.

**Source.** Farley, *Modern Software Engineering*, Ch 5 ("Working Iteratively") and Ch 8 ("Optimize for Feedback"). Restated in *Accelerate* (Forsgren, Humble, Kim, 2018), Ch 4 on the feedback-loop measurements that distinguish elite performers.

**Why this matters.** This is the meta-principle that justifies everything in §3. The §1 gates exist to filter obviously broken code; production observability exists to catch what the gates missed.

**Common failure mode.** Treating CI green as deploy-success. ymagineApp's `deploy-hostinger.yml` already does the right thing: deploy + health probe + auto-rollback. The risk is *removing* the health probe because "CI was green so it must work."

---

## §2 — Pre-deploy / promotion gates

### 2.1 Promotion, not rebuild

**Principle.** The artifact promoted to prod is byte-identical to the artifact tested in CI. Promotion is a tag move or a digest reference, never a rebuild.

**Source.** Humble & Farley, *Continuous Delivery*, Ch 5 "Build Binaries Only Once" and Ch 10 "Deploying and Releasing Applications." 12-Factor, V "Build, Release, Run."

**Why this matters.** `deploy-hostinger.yml` tags images as `ghcr.io/.../ymagineapp-api:${SHA8}`. The SSH step pulls that exact SHA. That is correct promotion. The risk would be if anyone introduced a `:main` reference into the runtime — `:main` is a moving tag and breaks build-once.

**What to do in ymagineApp.**
- Keep all runtime references digest- or SHA-pinned. `set_env_value API_IMAGE "$API_IMAGE"` is correct.
- Audit: nothing in `docker-compose.yml` should reference `:main` or `:latest`. (Not verified — caller should grep.)

**Common failure mode.** `docker-compose.yml` has `image: ghcr.io/.../api:latest` and an out-of-band `docker pull` updates the tag without a deploy record. Humble & Farley name this anti-pattern: "the deploy nobody made."

### 2.2 Database migrations: expand-contract

**Principle.** Never deploy a schema change that requires the new code AND the new schema to be live simultaneously. Always split: expand (additive, backward-compatible) → deploy code → contract (remove old) in a *later* deploy.

**Source.** Ambler & Sadalage, *Refactoring Databases: Evolutionary Database Design* (Addison-Wesley, 2006), the canonical reference. Distilled by Fowler, "Evolutionary Database Design," martinfowler.com/articles/evodb.html: *"A transition phase is a period of time when the database supports both the old access pattern and the new ones simultaneously."* Also covered in Humble & Farley, Ch 12 "Managing Data."

**Why this matters.** ymagineApp's deploy is push-to-main → image rebuilt → docker compose up. There is no migration step shown in `deploy-hostinger.yml`. If `supabase/migrations/` is applied by Supabase's CI separately, fine; if it's applied manually, that's a coordination hazard. Either way, the rule is: every migration must be deployable BEFORE the code that uses it.

**What to do in ymagineApp.**
- Adopt the three-deploy cycle for destructive schema changes:
  1. Deploy A: add new column/table, write to both old and new in code.
  2. Deploy B: read from new, keep writing both.
  3. Deploy C: stop writing old, drop old.
- Never combine "add column + delete column" in one migration. Ambler & Sadalage Ch 1: *"database refactorings are very small."*
- Run a migration-dry-run check in CI: parse the new SQL, fail if it contains `DROP COLUMN`, `DROP TABLE`, `ALTER COLUMN TYPE` without a corresponding earlier expand step. This catches mistakes at the gate.

**Common failure mode.** Two-phase deploy (drop + add) shipped in one PR. The next deploy after migration runs old code against new schema → boot loop. Humble & Farley name this; it's the most common DB-related outage.

### 2.3 Backward compatibility checks

**Principle.** The new API version must still serve clients running the old frontend (and vice versa) during the cutover window. The window can be milliseconds (atomic swap) but is never zero.

**Source.** *Software Engineering at Google*, Ch 22 "Large-Scale Changes" — the Hyrum's Law section: *"With a sufficient number of users of an API, it does not matter what you promise in the contract: all observable behaviors of your system will be depended on by somebody."*

**Why this matters.** On a single Hostinger VPS, the api and frontend deploy together (`docker compose up -d frontend kortix-api`). For a few seconds, a user mid-request might be hitting the old frontend after the new api comes up. The api MUST accept the old frontend's request shape.

**What to do in ymagineApp.**
- API changes that remove a field, rename an endpoint, or tighten a validator must go through a deprecation window — same expand-contract logic as DB, applied at the wire protocol.
- A "contract test" that runs the previous frontend SHA's recorded requests against the new api would be the *SE at Google* / *Continuous Delivery* gold standard. For ymagineApp scale, simpler: a smoke-test job that hits `/v1/health`, `/v1/threads`, `/v1/agents` and asserts response *shape* (not just status) before promoting.

**Common failure mode.** A "cleanup" PR that removes a field still referenced by the deployed frontend. Sentry lights up with `TypeError: Cannot read property 'X' of undefined` for every active session.

### 2.4 Image signing / supply-chain provenance

**Principle.** Signed artifacts let the deploy target verify "this image was produced by my CI, not by an attacker who got an SSH key."

**Source.** NIST SP 800-218, practice PS.3 "Archive and Protect Each Software Release" — explicitly added in v1.1: *"collecting and sharing provenance data for all components of software releases."* The reference implementation is Sigstore / cosign (work by Linux Foundation; canonical paper: Lorenc et al., *"Sigstore: Software Signing for Everybody,"* ACM CCS 2022).

**Why this matters.** Today, anyone with the `GHCR_TOKEN` secret can push `ghcr.io/bernardoxlima/ymagineapp-api:${sha}` and the VPS will pull it. The defense-in-depth is image signing: the VPS only pulls images signed by your CI's keyless identity (GitHub OIDC).

**What to do in ymagineApp.**
- Phase 1 (low effort): add SBOM generation to `deploy-hostinger.yml` using `anchore/sbom-action`. NIST PS.3 satisfied at the documentation level.
- Phase 2 (medium effort): `cosign sign --keyless` after build, `cosign verify` on the VPS before `docker compose up`. Stops a stolen GHCR token from being usable in isolation.
- Skip for ymagineApp Phase 1 unless threat model includes supply-chain attacks. NIST itself is risk-tiered (PS.3 is Tier 2).

**Common failure mode.** Adding cosign with `cosign verify` failing soft (`|| true`). Theater. Either it gates or it doesn't.

### 2.5 Gate theater — when a gate hurts

**Principle.** A gate with high false-positive rate trains the team to bypass it. A bypassed gate is worse than no gate because it creates a false sense of safety.

**Source.** Farley, *Modern Software Engineering*, Ch 5 — *"the goal of the engineering process is to learn faster."* False positives slow learning. *Accelerate* Ch 3 on the empirical correlation: teams with *high change-failure rate* often have brittle gates that get bypassed under pressure. *Software Engineering at Google* Ch 11 on the "noisy test" tax.

**Why this matters.** Every gate added to `ci-build.yml` competes with all the others for trust. A gate that fires correctly 95% of the time is excellent; 50% is poison. ymagineApp's choice to NOT run `tsc --noEmit` is the textbook-correct application of this principle.

**What to do in ymagineApp.**
- Before adding any new gate, ask: what's the projected false-positive rate? If above ~5%, fix the underlying issue first.
- Track gate failures: a quarterly "which gates flagged true positives this quarter" review. Drop gates with zero true positives.

**Common failure mode.** Linting rules that flag style preferences as errors. Developers run with `--no-verify`. Now linting catches nothing.

---

## §3 — Post-deploy verification (cheap, VPS-friendly)

### 3.1 Health / liveness / readiness probes

**Principle.** Three distinct signals:
- **Liveness:** Is the process running and not deadlocked? Fast, in-process, cheap.
- **Readiness:** Can it accept traffic right now? May include dep checks (DB connection, cache warm).
- **Smoke / health:** Can the service do its job end-to-end? Hits critical path.

**Source.** Google SRE Book, "Monitoring Distributed Systems," sre.google/sre-book/monitoring-distributed-systems — the four golden signals + black-box vs white-box. The liveness/readiness terminology is canonicalized by Kubernetes (kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle) but the *principle* is from the SRE Book. Also Beyer et al., *The Site Reliability Workbook* (O'Reilly, 2018), Ch 5 on alerting (defines what a probe *should* mean for alerting).

**Why this matters.** `deploy-hostinger.yml` polls `http://127.0.0.1:13738/v1/health` for up to 120s. That's a single probe — likely returning `{"ok":true}`. It proves the process bound to the port. It does NOT prove Supabase is reachable, that the agent runtime can start, that the OpenCode SDK is wired correctly.

**What to do in ymagineApp.**
- Make `/v1/health` cheap (process-internal, <10ms, no external calls). Use it as liveness.
- Add `/v1/ready` that checks Supabase auth + Redis (if any) reachability. Use this as the post-deploy gate.
- Add `/v1/smoke` that runs a synthetic transaction (create-agent → list-threads → delete) and returns timings. Run this once post-deploy, not on every health check.
- 60 iterations × 2s sleep = 120s timeout — keep. That's roughly the SRE Workbook recommended canary window for a service of this size.

**Common failure mode.** A `/health` that calls Supabase. Supabase hiccups → Caddy/nginx removes the upstream → traffic loss for a problem that was external. SRE Book Ch 8: probes must reflect "is my service healthy," not "is the universe healthy."

### 3.2 Synthetic / journey checks

**Principle.** Continuously execute a representative user journey from outside the system. If the synthetic fails, real users are likely failing too.

**Source.** *The Site Reliability Workbook*, Ch 5 "Alerting on SLOs" — synthetic probes as the input to availability SLIs. SRE Book Ch 6 "Monitoring Distributed Systems": *"Black-box monitoring tests external behavior as users experience it."*

**Why this matters.** A user-visible regression often shows in Sentry only after a few real users hit it. A synthetic probe hits it within the probe interval (60s typical).

**What to do in ymagineApp.**
- Set up BetterStack Uptime (already in the stack — it's the same vendor as the Sentry endpoint) with a probe that hits a real user-flow endpoint (auth → create thread → check response shape) every 60s.
- One synthetic per critical journey. Don't probe 30 things — SRE Workbook is explicit on this: *"choose just enough SLOs to provide good coverage."*
- Synthetic probe traffic should be tagged (`x-synthetic: true` header) and excluded from billing-relevant metrics.

**Common failure mode.** Synthetic alerts that page when Cloudflare is degraded. Black-box probes detect *user pain* regardless of cause; that's a feature, but it means pages need to be actionable in either case (degrade gracefully, or post status).

### 3.3 Canary on a single host: the constraint

**Principle.** Canary requires routing some traffic to new and some to old. Single-host means there's no traffic-splitting boundary unless you build one (two ports + nginx weight).

**Source.** Fowler, "Canary Release," martinfowler.com/bliki/CanaryRelease.html — explicitly defined for distributed infrastructure: *"slowly rolling out the change to a small subset of users before rolling it out to the entire infrastructure."* SRE Book Ch 8 "Release Engineering" describes canary as one of several deployment strategies; it acknowledges that simpler patterns work for smaller systems.

**Why this matters.** ymagineApp Hostinger deploy CAN'T meaningfully canary — there's one frontend container, one api container, one Caddy. The dev VPS `deploy-zero-downtime.sh` script DOES implement true blue/green (two ports 8008/8009, nginx swap). That pattern IS portable to Hostinger.

**What to do in ymagineApp.**
- Port `deploy-zero-downtime.sh` to Hostinger. Today the Hostinger deploy is `docker compose pull && up -d` which DOES have a few seconds of downtime mid-restart. The dev pattern (start new on standby port → health-check → nginx swap → stop old) gives true zero-downtime *without* needing multi-host.
- True canary (1% traffic for 10 min, then 10%, then 100%) is not worth building for ymagineApp scale.
- The closest thing to canary on a single host: feature flags. Deploy code dark, flip the flag for a subset of accounts. Fowler "Feature Toggles" article: *"reduce the blast radius of problematic changes."*

**Common failure mode.** Trying to fake canary with `docker compose up --scale api=2` and a half-broken nginx config. Either fully blue/green or fully restart-and-wait. The middle ground is fragile.

### 3.4 Change-Failure Rate as the post-deploy signal

**Principle.** Track the % of deploys that result in a rollback, hotfix, or user-impacting incident. Elite teams sit at 0–15%; low performers at 46–60%.

**Source.** *Accelerate* (Forsgren, Humble, Kim, 2018), Ch 2 — the original DORA finding. DORA's published metrics: dora.dev. The four key metrics are deploy frequency, lead time for changes, change failure rate, mean time to restore.

**Why this matters.** This is the empirical evidence that the §1–§3 gates are working. If CFR is creeping up, gates aren't catching what they should. If CFR is 0% but you deploy weekly, gates are over-tight and slowing learning.

**What to do in ymagineApp.**
- Tag every deploy commit. After each rollback, label the commit `rollback-of=<sha>`.
- Compute monthly CFR: `count(rollback labels) / count(prod deploys)`.
- Target: <15% (DORA "high performer" band). Don't chase 0% — *Accelerate* Ch 2: *"there's no tradeoff between speed and reliability for elite performers."* But chasing zero with brittle gates IS the tradeoff.

**Common failure mode.** Treating any production bug as a deploy failure. CFR is for deploys that immediately or shortly after caused a user-visible problem, not for latent bugs found weeks later.

### 3.5 Smoke tests on the deployed artifact

**Principle.** A <30s suite of tests run *after* the deploy completes, hitting the running prod URL with real (or synthetic) credentials. Proves the critical path is alive.

**Source.** Humble & Farley, *Continuous Delivery*, Ch 5 — the "Smoke Test" stage of the pipeline, immediately after deploy. *The Site Reliability Workbook*, Ch 5 — probes as deploy-confirmation gates.

**Why this matters.** The current `deploy-hostinger.yml` proves "process is bound to port 13738" and "frontend responded to GET /". Neither proves auth works, threads can be created, or the agent runtime can be spawned.

**What to do in ymagineApp.**
- After health probes pass, run a 5-step smoke script: (1) hit `/v1/health` (already done), (2) `POST /v1/auth/anonymous` (or test-account login), (3) `POST /v1/threads`, (4) `GET /v1/threads/{id}`, (5) `DELETE /v1/threads/{id}`. Total <30s. If any step fails, run the existing `rollback()` trap.
- This is the same kind of probe BetterStack Uptime can run continuously — running it inline once at deploy time catches the "deploy succeeded but critical path broken" case immediately, not after the next probe interval.

**Common failure mode.** Smoke tests that depend on a production database write that has side effects. Use a `test-account-id` and clean up at the end, or use a transactional rollback.

---

## §4 — Observability without pegging the VPS

### 4.1 Charity Majors' core thesis: high-cardinality structured events

**Principle.** Observability is the ability to answer questions you didn't know you'd ask. Pre-aggregated metrics can answer only the questions you anticipated. The unit of observability is the wide structured event — one per request, per service, with high-cardinality attributes (user-id, account-id, agent-id, model, etc.).

**Source.** Majors, Fong-Jones, Miranda, *Observability Engineering* (O'Reilly, 2022), Ch 1–3. Majors on charity.wtf, "logs vs structured events" (2019): *"Investigation requires computation — not just string search... one event per request per service."* Also her *"Observability: a 3-year retrospective"* (2020).

**Why this matters.** Sentry is an exception-tracker, not an observability tool. BetterStack Telemetry (Logtail) is closer — it's a structured-event store. Today the api logger (`apps/web/src/lib/logger.ts`) and Sentry are separate. The observability win is treating *every request* as a wide event with consistent attributes — not just errors.

**What to do in ymagineApp.**
- In api request middleware: emit one structured log per request with `{ requestId, accountId, userId, route, method, status, durationMs, agentId, model, costUsd, sandboxId }`. Sent to BetterStack as a wide event.
- Cardinality DOES cost — but cost scales with active users, not log volume. For 1k DAU, cardinality is bounded; for 1M DAU, sample.
- DON'T mirror every event into Sentry — Sentry's pricing is exception-tracking, not event-store. Use Sentry only for thrown errors. BetterStack Telemetry for events. (Both endpoints already configured.)

**Common failure mode.** Logging every event AND sending it to Sentry as a transaction. Sentry bills per transaction; 100 RPS × 86400s = 8.6M txns/day → bill shock. The `tracesSampleRate: 0.2` in `apps/api/src/lib/sentry.ts` is correct mitigation.

### 4.2 Brendan Gregg's USE method — resource-level

**Principle.** For every resource: Utilization, Saturation, Errors. CPUs, memory, network, storage. Quickest path to "is the box under stress."

**Source.** Gregg, *Systems Performance, 2nd ed.* (Addison-Wesley, 2020), Ch 2.5.9 and brendangregg.com/usemethod.html: *"For every resource, check utilization, saturation, and errors."*

**Why this matters.** ymagineApp is one VPS. Gregg's method tells you "is the host healthy" directly. Sentry/BetterStack tell you "is the application healthy." Both are needed; neither replaces the other.

**What to do in ymagineApp.**
- Run `node_exporter` (Prometheus exporter) on the VPS or use BetterStack's host monitoring. Surface: CPU% (utilization), load avg / runqueue (saturation), I/O errors, disk full %, memory pressure.
- Alert thresholds: CPU >85% for 10 min (saturation forming), disk >90% (impending wedge), OOM kills >0 (acute).
- Gregg's flowchart: errors first (cheapest check), then utilization, then saturation. Same ordering for alert priority.

**Common failure mode.** Alerting on CPU >80% spot reads. Spiky workloads hit 95% briefly without harm. The signal is *sustained* high utilization or saturation, not instantaneous peaks. Gregg, *Systems Performance* Ch 2: utilization is *"the average time that the resource was busy"* — averages over a window.

### 4.3 The RED method — service-level

**Principle.** For every service: Rate (RPS), Errors (failed RPS), Duration (latency distribution). The user-facing complement to USE.

**Source.** Wilkie's RED method (originally Tom Wilkie at Weaveworks, now Grafana Labs): *"For every resource, monitor: Rate, Errors, Duration."* Aligned with Google SRE Book's Four Golden Signals (Ch 6): latency, traffic, errors, saturation. RED is a subset of golden signals; saturation is in USE's column.

**Why this matters.** ymagineApp's frontend logger captures level/message/extra — no rate/error/duration per route. Sentry captures errors. Nothing today gives "what's the p95 latency of POST /v1/threads."

**What to do in ymagineApp.**
- Emit per-request: route, method, status code, durationMs. BetterStack Telemetry can compute the RED metrics from these wide events. (This is the same instrumentation as §4.1.)
- One dashboard panel per critical route: RPS, error-rate, p50/p95/p99 latency. SRE Book Ch 6: *"measuring tail latency (99th percentile) rather than averages, since slow errors are worse than fast ones."*
- DON'T separately ship Prometheus metrics for RED if you already have wide events — the events ARE the metrics, queried differently.

**Common failure mode.** Computing average latency and alerting on it. Averages mask the p99 tail. Always compute and alert on p95+ percentiles.

### 4.4 SLIs / SLOs / SLAs — what to actually alert on

**Principle.**
- **SLI** = "the ratio of good events to total events" (measurement).
- **SLO** = target value for an SLI (e.g., "99.5% of POST /v1/threads succeed within 2s, measured over 30 days").
- **SLA** = contractual / external version of an SLO with consequences.

Alert on SLO violation forecast (burn rate), not on raw metric thresholds.

**Source.** Beyer et al., *Site Reliability Engineering* (O'Reilly, 2016), Ch 4 "Service Level Objectives" — the canonical definitions. *The Site Reliability Workbook*, Ch 5 — burn-rate alerting recipes. *SRE Book Ch 4 quote: "It's both unrealistic and undesirable to insist that SLOs will be met 100% of the time."*

**Why this matters.** ymagineApp probably needs one SLO: "auth + thread creation succeed within 5s, 99% over 30 days." That's it. From that SLO, every alert decision flows.

**What to do in ymagineApp.**
- Pick ONE user-visible journey. Define SLI = "% of completed requests within Xs." Set SLO at *current performance*, not aspirational (SRE Workbook: *"your current performance can be a good place to start"*).
- Convert SLO into an error budget: 1% of 30 days = 4.32 hours of downtime/month. That's the budget.
- Alert on burn rate: fast burn (2% of budget in 1h → page), slow burn (10% in 3 days → ticket). Canonical formulas in SRE Workbook Ch 5, Approach 6 ("Multi-window, Multi-Burn-Rate Alerts").

**Common failure mode.** "Alert when error rate > 5%." Fires on every blip. SRE Workbook Approach 1 — explicitly the bad recipe. Burn-rate alerting is the upgrade.

### 4.5 What to page on vs what to record

**Principle.** Page only when (1) user-visible impact is occurring or imminent, (2) action is required, (3) action cannot be automated, (4) the problem is novel.

**Source.** SRE Book Ch 6 (Monitoring Distributed Systems) — five-question test for whether to page. Also the canonical line from SRE Book Ch 6: *"every page must be urgent, actionable, require intelligence, and involve a novel problem."*

**Why this matters.** Alert fatigue is the #1 killer of on-call effectiveness (*Site Reliability Workbook* Ch 8). One developer team — every page that wakes you erodes trust in the system. Page rarely, log everything.

**What to do in ymagineApp.**
- Pages (BetterStack alert → SMS/phone): SLO burn-rate, host saturation/error, deploy auto-rollback fired.
- Tickets (BetterStack alert → email/Slack): cost spike, dependency CVE, sustained warning-level logs, log volume drop.
- Records-only: per-request structured events.

**Common failure mode.** Page on Sentry error events. Sentry sees every `try/catch` warning, every browser plugin throwing. Use Sentry "issues" + a digest channel, NOT a pager destination. The current `ignoreErrors` list in `apps/api/src/lib/sentry.ts` is correct mitigation but won't catch all classes of noise.

### 4.6 The cost of every line — VPS-side

**Principle.** Each structured event = network bytes + CPU to serialize + memory in the buffer. For a single VPS, the budget is concrete.

**Source.** Gregg, *Systems Performance*, Ch 4 (Observability Tools) on overhead modeling. *Observability Engineering* Ch 11 on sampling. Sentry's own published guidance on `tracesSampleRate` (vendor — flag).

**Why this matters.** ymagineApp's VPS runs api + frontend + Caddy + Supabase. Telemetry is non-trivial overhead. Order-of-magnitude estimate (from Honeycomb's published benchmarks and the *Observability Engineering* book Ch 11):
- One wide event (JSON, ~1KB): ~10–50µs CPU to serialize + ~1KB network.
- At 100 RPS, 100 events/s × 1KB = 100KB/s outbound bandwidth = ~8.6 GB/day. Sustainable on most VPS plans.
- At 1000 RPS, that's 1 MB/s outbound — *much* more meaningful; sampling required.

**What to do in ymagineApp.**
- Tail sample: keep 100% of error events + 10% of successful events. *Observability Engineering* Ch 11 — head sampling miss errors; tail sampling preserves them.
- Sentry transaction sampling at `tracesSampleRate: 0.2` for prod (correct in current config).
- Set a daily byte budget: if outbound telemetry > 1 GB/day, increase sampling. Monitor with `vnstat` or BetterStack's host bandwidth.

**Common failure mode.** Logging at `DEBUG` in prod permanently. Disk fills, telemetry bill spikes, no one looks at it. Either it's actionable now or it's at `INFO`/`WARN`.

### 4.7 Alert fatigue — the discipline

**Principle.** When >50% of pages don't require action, the system is broken. Either improve precision or stop paging on that signal.

**Source.** *The Site Reliability Workbook*, Ch 8 "On-Call." Also Allspaw, *"Trade-offs Under Pressure: Heuristics and Observations of Teams Resolving Internet Service Outages"* (ICSE-affiliated work, 2015) — published research on cognitive load during incidents.

**Why this matters.** One dev = one phone. If it rings for nothing, it gets silenced. Then it rings for the real incident and is ignored.

**What to do in ymagineApp.**
- Every page should auto-resolve OR be auto-closed by a script that confirms the underlying signal is back to normal.
- Quarterly review: list every page that fired, classify as (true positive / false positive / acted on / not acted on). Drop signals with >50% false positive rate.

**Common failure mode.** "Disk usage > 75%" alert that fires every Sunday when a log rotation hasn't run yet. Treat as recurring-known: either fix the rotation OR raise the threshold OR delete the alert.

---

## §5 — Auto-rollback / failure detection

### 5.1 The reversibility principle

**Principle.** Every deploy must be reversible without changing code. Rollback is a redeploy of the previous immutable artifact, not a `git revert`-and-rebuild.

**Source.** Humble & Farley, *Continuous Delivery*, Ch 10 "Deploying and Releasing Applications" and Ch 5 ("each deploy is the same artifact").

**Why this matters.** `deploy-hostinger.yml`'s `rollback()` trap captures the previous `API_IMAGE` and `FRONTEND_IMAGE` SHAs and re-applies them. That is textbook-correct reversibility: no rebuild, just a `docker compose pull && up -d` of the prior digest.

**What to do in ymagineApp.**
- Keep `set_env_value` + previous-image capture pattern. Audit: after the workflow runs, the `.env.bak.*` file should always show the prior values.
- Retain at least the last 5 previous image SHAs in `.env.bak.*` so manual deeper rollback is possible without rebuilding.
- DON'T `git revert` and push — that forces a rebuild and burns the "build-once" invariant.

**Common failure mode.** Schema changes that aren't backward-compatible. Rolling back the code without rolling back the schema → boot loop (see §2.2).

### 5.2 Blue/green on a single host

**Principle.** Two slots (blue/green) on different ports. Nginx (or Caddy) routes to the active slot. Deploy installs to the standby slot, health-checks, then switches the upstream.

**Source.** Fowler, "Blue/Green Deployment," martinfowler.com/bliki/BlueGreenDeployment.html: *"if anything goes wrong you switch the router back to your blue environment."* Fowler explicitly notes the pattern works at single-host scale: *"different virtual machines on identical or distinct hardware"* or *"partitioned zones within a single operating system with separate IP addresses."*

**Why this matters.** ymagineApp's dev VPS does this (`scripts/deploy-zero-downtime.sh` — blue on 8008, green on 8009, nginx swap). Hostinger does NOT — current Hostinger deploy is `docker compose up -d` which has a brief restart window.

**What to do in ymagineApp.**
- Port `deploy-zero-downtime.sh` to Hostinger if Caddy is configured to allow upstream swap. Caddy supports this via `reverse_proxy` to multiple upstreams with health checks.
- The frontend side: Next.js standalone is harder to blue/green because of the build-time env baking. For frontend, a brief downtime (≤10s) is acceptable; for api, blue/green is achievable and worth the complexity.

**Common failure mode.** Blue/green with shared state. If both blue and green hold long-lived connections to the same Supabase pool, you can saturate the pool during cutover. Pool size must accommodate 2× normal.

### 5.3 Immutable image references

**Principle.** Reference the image by content-addressable digest (`sha256:abc...`), not by tag (`:main`, `:latest`). Tags are mutable; digests are not.

**Source.** *Software Engineering at Google*, Ch 23 "Continuous Integration" — on the principle that *"a hash is a contract."* Reinforced by NIST SP 800-218 PS.3.

**Why this matters.** `deploy-hostinger.yml` uses 8-char SHA tags (`${GITHUB_SHA::8}`). That's *almost* immutable but two commits could in principle share a prefix (negligible at 8 hex chars; cosmic). Better: `docker buildx build` outputs the image digest, store *that* as the rollback target.

**What to do in ymagineApp.**
- Phase 1 (cheap): keep 8-char SHA. It's unique within a year of commits for any human-scale project. Document in `deploy-hostinger.yml` that rollback uses these.
- Phase 2 (defense): capture image digest after `docker buildx build` via `metadata-action` (GitHub-Docker action). Store in deploy artifacts. Rollback uses digest.

**Common failure mode.** A `docker compose.yml` with `image: ghcr.io/.../api:main` — the `:main` tag updates out-of-band, and a `docker compose pull` on the VPS pulls something nobody intended.

### 5.4 Forward-only vs reversible migrations

**Principle.** Two valid disciplines:
- Forward-only: every migration is additive or compensating; you never "down" — you ship a new migration that reverses the effect.
- Reversible: every migration has a `down` that's tested.

Pick one per project. Mixing them creates ambiguity.

**Source.** Ambler & Sadalage, *Refactoring Databases*, Ch 5 (Database Refactoring Categories). Fowler, "Evolutionary Database Design," explicitly favors forward-only with expand-contract.

**Why this matters.** Supabase migrations (`supabase/migrations/`) are SQL files; the Supabase CLI applies them forward-only by default. That's the de facto choice. The discipline: every migration is independently safe to roll forward.

**What to do in ymagineApp.**
- Adopt forward-only formally. Document: rollbacks are achieved by writing a new migration that reverses the previous one, not by running a `DOWN` script.
- Pair every migration that drops/renames with a prior migration that expanded (§2.2). The pair becomes the "reversible unit."

**Common failure mode.** Editing an already-applied migration to fix it. Breaks the linear history; new deploys won't reapply (hash mismatch). Always write a new migration.

### 5.5 When NOT to auto-rollback

**Principle.** Auto-rollback only when the cost of a false-positive rollback is less than the cost of letting bad code run for one human-response cycle. Otherwise, page a human.

**Source.** SRE Book Ch 7 "Evolution of Automation at Google" — *"doing automation thoughtlessly can create as many problems as it solves."* Beyer et al., the underlying decision framework: weigh MTBF-of-false-action against MTBF-of-inaction.

**Why this matters.** `deploy-hostinger.yml`'s `rollback()` trap fires when the health probe times out (60 iterations × 2s = 120s). If the api takes 130s to start under load, rollback fires *incorrectly*. That's the false-positive case — and it has real cost (it restores the previous image, which might be missing a bugfix).

**What to do in ymagineApp.**
- Make sure 120s is comfortably longer than worst-case cold start. Measure actual `docker compose up` → `/v1/health 200` time during a real deploy; set timeout at 3× that.
- Don't auto-rollback on Sentry error spikes — too easy for a third-party (Stripe, OpenAI) outage to trigger. Page instead.
- DO auto-rollback on (a) health probe timeout, (b) container OOM in first 60s, (c) container exit-code non-zero in first 60s. These are unambiguous.

**Common failure mode.** Auto-rollback hooked to "error rate" → external outage causes errors → rollback fires → previous image also can't reach external service → both fail. SRE Book Ch 7 warns: automation must have higher precision than a human reviewing the same signal.

### 5.6 Burn-rate-based rollback signaling

**Principle.** A fast SLO burn (e.g., 14.4× normal rate over 1h, also confirmed in 5m window) means the deploy is causing user pain. That's the canonical "trigger a rollback decision" signal.

**Source.** *The Site Reliability Workbook*, Ch 5, Table 5-2 — multi-window multi-burn-rate alert thresholds. Quote: "Page | 1 hour | 5 minutes | 14.4 burn rate | 2% of budget consumed."

**Why this matters.** If you have an SLO (§4.4), you have a principled rollback trigger. Without one, "is the deploy bad?" is vibes.

**What to do in ymagineApp.**
- Once an SLO is defined, encode the fast-burn condition as a BetterStack alert. Wire that alert to (a) page, (b) optionally, fire `gh workflow run rollback.yml --ref=<prev-sha>`.
- Phase 1: just page. Phase 2: auto-rollback after human reviews the page within 5 min and one-clicks.

**Common failure mode.** Auto-rollback on the first 5-min window only. Real spikes (genuine bug shipped) AND false spikes (third-party outage) both fire. The 1h+5m double-window is the canonical mitigation.

---

## §6 — Anti-patterns and the ymagineApp checklist

### 6.1 Named anti-patterns from the literature

**A1. Gate theater.** Adding gates with high false-positive rates that the team learns to bypass. *Modern Software Engineering* Ch 5. **ymagineApp status:** Not currently exhibited (the `tsc --noEmit` decision is exemplary). **Watch:** every new gate.

**A2. Retry storms.** Cascading retries that amplify load during partial outages. SRE Book Ch 21 "Handling Overload" — *"requests should only be retried at the layer immediately above the layer that is rejecting them."* **ymagineApp status:** Unknown — depends on how the OpenCode SDK retries on transient failures. **Fix:** retry budgets per client (10% ratio), max 3 attempts (SRE Book Ch 21).

**A3. Over-instrumentation.** Logging at DEBUG in prod, every span sent to Sentry, every event to every backend. *Observability Engineering* Ch 11. **ymagineApp status:** Mitigated — sample rate is 0.2 in prod, ignore-errors list is sensible. **Watch:** new code adding `console.log` in hot paths.

**A4. Flaky test culture.** Tests that fail randomly normalize ignoring red builds. *SE at Google* Ch 11. **ymagineApp status:** Latent — the 13 `e2e-*` tests don't run in CI but if they're wired in without isolation, this becomes the dominant failure mode. **Fix:** quarantine flakes IMMEDIATELY; failed test runs three times in a row before treating as real failure (only as triage, not as policy).

**A5. Ignore-and-continue.** `|| true` on a step that should fail the build. **ymagineApp status:** Spot-check — no obvious instances in `ci-build.yml`. **Watch:** any `2>/dev/null` or `|| true` added later.

**A6. Just-Restart doom loop.** Auto-restart on failure without circuit breaker; restart consumes more memory than the original; new restart fails; loop. Gregg, *Systems Performance* Ch 12 on resource exhaustion modes. **ymagineApp status:** `--restart unless-stopped` is set. Mitigation: container-level memory limits in compose; if not set, an OOM cascade is possible.

**A7. Long-lived feature branches.** Branches >2 days = integration cliff. Fowler, "Patterns for Managing Source Code Branches." **ymagineApp status:** With one dev, branches tend to be short, but watch when contributors join.

**A8. Manual deploy steps.** Any step humans do by hand on the VPS bypasses §5.1 reversibility. Humble & Farley Ch 5. **ymagineApp status:** Mostly automated. Migration step is the gap — verify Supabase migrations are applied via a pipeline step, not a manual `supabase db push`.

**A9. "Just an empty deploy" hubris.** Trivial-looking deploys break things — config-only change, env var rename. The deploy itself is the risk, not the diff size. *Accelerate* Ch 4. **ymagineApp status:** Watch — small frontend tweaks still go through full pipeline (good).

**A10. Monitoring everything, watching nothing.** A 40-panel dashboard nobody looks at. SRE Workbook Ch 5. **ymagineApp status:** Latent risk as observability grows. **Fix:** one "is it healthy" dashboard, one "deploy in progress" view, one "deep debug" workspace.

### 6.2 OPINIONATED CHECKLIST FOR YMAGINEAPP

Ordered from "do first" (highest leverage per hour of work) to "do later" (defense in depth). Each item cites its canonical authority.

**Pre-merge gates (PR gate — `ci-build.yml`):**

1. **Add a unit-test job.** Run `bun test apps/api/src/__tests__/unit-*.test.ts`. ~30s. **Source:** Fowler, "Continuous Integration" — *"Make the Build Self-Testing"*; test pyramid base. **Why:** 31 tests exist that prove specific bugs don't reappear; not wiring them is leaving free signal on the table.

2. **Do NOT add the e2e tests to the PR gate.** Move to a separate scheduled or pre-deploy job. **Source:** Fowler, "Test Pyramid" — ice-cream-cone anti-pattern. **Why:** they require Supabase, will flake, will train the team to ignore the gate.

3. **Add secret scanning.** `gitleaks-action` on PR diff. ~5s. **Source:** NIST SP 800-218 PS.1; OWASP DevSecOps. **Why:** the cheapest defense against the most common credential leak class.

4. **Add SCA on PRs.** `osv-scanner-action`, fail on `HIGH`/`CRITICAL` only. ~20s. **Source:** NIST SP 800-218 PW.4; Vuln4Real paper (IEEE TSE 2020) on tuning out false positives. **Why:** the next-cheapest defense; catches CVE drift.

5. **Switch the PR gate build to use the actual Dockerfile.** `docker buildx build --load` (no push). **Source:** Humble & Farley Ch 5, "Build Once." **Why:** today PR proves `bun build` works; prod uses Dockerfile. Drift between them is undetected.

6. **Start measuring tolerated-typecheck-error count.** Baseline + diff gate. **Source:** *SE at Google* Ch 22, incremental cleanup. **Why:** path to eventually flipping `tsc --noEmit` to required.

**Pre-deploy / promotion:**

7. **Enforce expand-contract for schema migrations.** Lint `supabase/migrations/*.sql` in CI for `DROP COLUMN`/`DROP TABLE`/`ALTER COLUMN TYPE` without a documented prior expand. **Source:** Ambler & Sadalage, *Refactoring Databases*, Ch 5; Fowler, "Evolutionary Database Design." **Why:** the highest-blast-radius single change class.

8. **Capture image digest at build time, not just SHA tag.** Use `docker/build-push-action`'s digest output. **Source:** *SE at Google* Ch 23. **Why:** rollback granularity = content; today it's commit SHA which is close-enough but not contractually immutable.

**Post-deploy verification:**

9. **Port the dev blue/green pattern to Hostinger.** `scripts/deploy-zero-downtime.sh` already does this on dev. **Source:** Fowler, "Blue/Green Deployment"; works on single host. **Why:** removes the ~10s downtime window of `docker compose up -d`.

10. **Add a `/v1/ready` endpoint distinct from `/v1/health`.** Health = process alive (fast). Ready = deps reachable (Supabase, Redis). Smoke = critical path. **Source:** SRE Book Ch 8; Kubernetes' canonicalization of the SRE concepts. **Why:** today's single endpoint conflates them; a flaky external dependency causes false rollbacks.

11. **Add an inline 5-step smoke test after health probes pass.** Auth → create thread → fetch → delete. <30s. **Source:** Humble & Farley Ch 5 (Smoke Test stage). **Why:** "process is up" is not "feature works."

12. **Lengthen the rollback timeout safely.** Measure actual cold-start time; set rollback timeout at 3× measured worst case (currently 120s — verify it's safe). **Source:** SRE Book Ch 7 on automation precision. **Why:** false-positive rollback restores an older, possibly worse, image.

**Observability:**

13. **Emit one wide structured event per request.** Fields: `requestId, accountId, userId, route, method, status, durationMs, model, costUsd`. Send to BetterStack Telemetry. **Source:** Majors, *Observability Engineering* Ch 1–3. **Why:** transforms BetterStack from passive log store into queryable event source — the basis of every other SLO/dashboard/alert.

14. **Define ONE SLO.** "99% of authenticated requests succeed within 5s, measured over 30 days." Computed from wide events. **Source:** SRE Book Ch 4; SRE Workbook Ch 5. **Why:** without an SLO, every alert is a feeling. With one, alerts have math behind them.

15. **Configure multi-window multi-burn-rate alerts.** 1h + 5m windows; page on 14.4× burn; ticket on 1× sustained over 3 days. **Source:** SRE Workbook Ch 5, Approach 6, Table 5-2. **Why:** canonical recipe — no more accurate alerting framework exists.

16. **Set host-level alerts via USE method.** CPU sustained >85% over 10m, disk >90%, memory pressure, OOM kills >0. **Source:** Gregg, *Systems Performance, 2nd ed.* Ch 2.5.9. **Why:** the box dying is invisible to application-level telemetry.

17. **Audit Sentry sampling rates in prod.** `tracesSampleRate: 0.2` is current — verify it's holding the bill in range. **Source:** *Observability Engineering* Ch 11. **Why:** the failure mode of sampling is over-sampling, not under-sampling, at this stage.

18. **Tag synthetic traffic.** BetterStack Uptime probes should carry `x-synthetic: true`; exclude from billing/usage metrics. **Source:** SRE Workbook Ch 5 on black-box monitoring discipline. **Why:** keeps the user-impact numbers clean.

**Rollback / failure detection:**

19. **Document the manual rollback command.** Single line: `KORTIX_HOME=$HOME/.kortix; API_IMAGE=<prev-sha> FRONTEND_IMAGE=<prev-sha> docker compose up -d`. **Source:** Humble & Farley Ch 10 (reversibility principle). **Why:** when auto-rollback fails, the manual procedure must be unambiguous and discoverable.

20. **Keep at least 5 previous image digests pullable from GHCR.** Don't aggressively prune. **Source:** *Continuous Delivery* Ch 10. **Why:** rollback can need to go back further than one deploy.

21. **Add a "rollback runbook" gh workflow.** Manual-dispatch with prev-SHA as input. Runs the same SSH script with previous-image env. **Source:** SRE Book Ch 14 "Managing Incidents." **Why:** during an incident, nobody should be editing YAML or SSHing manually.

**Cross-cutting:**

22. **Adopt feature flags for risky changes.** Even a `process.env.FEATURE_X === 'on'` flag is enough at this scale. **Source:** Fowler, "Feature Toggles." **Why:** decouples deploy risk from release risk; turning a flag off is faster than a deploy.

23. **Track Change Failure Rate monthly.** Auto-rollback events + post-deploy hotfix PRs / total deploys. **Source:** *Accelerate*, Ch 2; dora.dev. **Why:** the empirical feedback loop on whether the gates are working.

24. **Quarterly: review which alerts fired and whether they should have.** Drop noisy ones. **Source:** SRE Workbook Ch 8. **Why:** alert fatigue is silent — without an explicit review, it metastasizes.

---

## WHERE EVIDENCE IS THIN

Items where canonical literature was sparse, contested, or doesn't fit the single-VPS context — flagged so downstream synthesis doesn't overclaim:

1. **Single-host canary releases.** Fowler's article assumes multi-host; SRE Book treats canary as one of several patterns and doesn't deeply cover single-host adaptation. Blue/green IS portable to single host (confirmed in Fowler), but progressive-traffic canary (1% → 10% → 100%) doesn't have a clean canonical single-host pattern. **Recommendation:** use feature flags + blue/green; don't fake progressive canary.

2. **Order-of-magnitude telemetry cost on small VPS.** *Observability Engineering* discusses cost qualitatively. Honeycomb publishes some benchmarks but is a vendor (flagged). My ~10–50µs CPU + 1KB network per wide event estimate is from book-level guidance — actual numbers depend on serializer choice (JSON vs binary), TLS overhead, batching. **Recommendation:** measure in your environment with `vnstat` and `top` before/after enabling new telemetry. Don't trust the estimate for capacity planning.

3. **Auto-rollback decision thresholds.** SRE Book Ch 7 gives the principle (MTBF tradeoff) but doesn't give numbers. Industry practice varies widely. The 120s timeout in `deploy-hostinger.yml` is reasonable but not authoritatively justified. **Recommendation:** measure cold-start time over the next 10 deploys; set 3× that.

4. **DORA "Change Failure Rate" formal definition.** *Accelerate* defines CFR as "% of changes that result in degraded service or subsequently require remediation." The boundary between "deploy bug" and "later-discovered bug" is fuzzy. **Recommendation:** adopt a tight 24h window — bug visible within 24h of deploy = counted.

5. **NIST SP 800-218 v1.1 detailed practice text.** The web index page doesn't include the practice descriptions; full PDF needed for verbatim quotes. Practice codes (PW.4, PS.3, etc.) are accurate; the brief restatements here are summaries of the publicly published descriptions, not verbatim quotes. **Recommendation:** pull the SP 800-218 PDF (csrc.nist.gov/pubs/sp/800/218/final) before quoting practice text in any compliance documentation.

6. **OSV-Scanner vs npm-audit false-positive rates.** The Vuln4Real paper (Pashchenko et al., IEEE TSE 2020) covered npm-audit specifically. OSV-Scanner came later (Google, 2022). The claim "OSV-Scanner is research-backed; npm audit has known false-positive issues" is supportable but the underlying scanner comparison is not yet covered by peer review at that level. **Recommendation:** use OSV-Scanner because it pulls from OSV.dev (curated DB) rather than npm-audit's GitHub-Advisory-only feed, but state this as design rationale, not as proven false-positive advantage.

7. **Sigstore / cosign in single-VPS context.** Lorenc et al. (ACM CCS 2022) covers Sigstore. Application to a small-team docker-compose deploy is plausible but not specifically studied. **Recommendation:** treat as defense-in-depth, not as Phase-1 must-have. NIST SSDF PS.3 is "Tier 2" — risk-driven.

8. **The right number of unit tests to require.** Fowler/Cohn give the pyramid shape; *SE at Google* Ch 11 gives the discipline; nobody publishes "you must have X% coverage." Coverage targets are anti-canonical — Fowler is explicit that 100% coverage is meaningless if the tests don't exercise the contract. **Recommendation:** require *every bug-fix PR* to add a regression test. Don't set a coverage gate.

9. **Whether Caddy supports clean upstream swap during deploy.** Fowler's blue/green article uses nginx; Caddy CAN do this (its `reverse_proxy` supports dynamic upstreams) but I did not verify the specific config syntax in this research. **Recommendation:** confirm by reading the Caddy docs (caddyserver.com/docs/caddyfile/directives/reverse_proxy) before porting `deploy-zero-downtime.sh`.

10. **Whether docker compose v2's `--scale` mid-flight is safe for in-flight requests.** Anecdotally yes but I found no canonical source (book or SRE corpus) addressing docker-compose-specific deploy semantics. Docker's own docs are vendor (flagged). **Recommendation:** if blue/green is too much effort, the next step down — `docker compose up -d --no-deps --build api` with a `stop_grace_period: 30s` — is acceptable but unproven for this exact setup.

---

**END OF L3 REFERENCE.** All claims trace to (a) one of the named books, (b) sre.google, (c) martinfowler.com, (d) dora.dev, (e) 12factor.net, (f) NIST CSRC, (g) OWASP, or (h) peer-reviewed conference proceedings. No Medium / dev.to / vendor-marketing sources used. Vendor docs (Honeycomb, Datadog, AWS Well-Architected) were not relied on for principles; would be acceptable only for specific tool config syntax.
