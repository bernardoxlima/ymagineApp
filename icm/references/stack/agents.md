# Stack — Kortix Team Agents (Layer 3 reference)

> How to design the agents that work a project's **Board** (the autonomous kanban), the best way.
> Load this when: creating/editing team agents, seeding a project, editing `core/kortix-master`
> agent logic, or debugging an empty Team tab.
> Sources: `D:\gandalf-skill\docs\anthropic-principles.md` (distilled from 19 Anthropic eng/docs
> sources — the reliable origin) + this fork's `core/kortix-master/src/services/project-v2-seed.ts`
> + model routing in `../models/coding-routers.md` + `../models/frontier-and-specialists.md`.
> Pitfalls that motivated this doc → [[claude-failure-modes]] §15. Decision → [[decisions]] D-024.

## Two kinds of "agent" — do NOT conflate (this is the #1 confusion)

| | **Kortix team agent** | **OpenCode session agent** |
|---|---|---|
| Stored as | row in `project_agents` (DB, per `project_id`) **+** materialized `.opencode/agent/<slug>.md` | just `.opencode/agent/<slug>.md` |
| Shows in **Team tab** | ✅ (tab reads `listAgents(db, projectId)` = the DB rows) | ❌ |
| Works the **Board** (column assignee, ticket trigger, @PM orchestration) | ✅ | ❌ |
| Loaded into a **session** (@-mention) | when triggered (materialized to the workspace OpenCode config) | only if it sits where the session's OpenCode config-dir/cwd actually looks |
| Created by | **Team tab → New agent** · or `seedV2Project` (seeds the PM) | anyone writing the file — **incl. an LLM in a session** |

> **The trap (D-024):** an LLM writing `.opencode/agent/*.md` into a project subfolder creates a
> *session agent* that the Board never sees AND that OpenCode (cwd `/workspace`) often never loads.
> It looks like "I built a team" but it's an orphan. **For the Board, the source of truth is the
> `project_agents` DB row** — create via the Team tab or seed, never by hand-writing files.

## The orchestrator → worker shape (how the team self-builds)

`seedV2Project` creates exactly ONE agent — **@project-manager** (orchestrator) — plus the default
columns (`backlog` default-assignee = PM). The PM then **shapes the worker team itself**, per the
ticket's scope. This mirrors Anthropic's multi-agent pattern (orchestrator plans; sub-agents do
deep work and return condensed results — `anthropic-principles.md §5`).

- **Baseline workers everywhere:** `@engineer` + `@qa`. Add `@tech-lead` when decomposition is
  non-trivial; `@designer`/specialists per domain. Don't pre-spawn a bloated roster — the PM
  proposes the smallest team that fits the scope (Anthropic: *"don't spawn a subagent for work you
  can do directly"* §5; bloated tool/agent sets are an anti-pattern §3).
- **Board flow = the verifier:** `backlog` → `in_progress` (implementer) → `review`
  (default-assignee **@qa** — the gate) → `done` (terminal); `blocked` is off-flow. QA gates via
  the review column's default-assignee, not a separate column. This is Anthropic principle #4
  (*"verify, verify, verify — the single highest-leverage thing"*) baked into the board topology.

## Model routing per role (best practice — NOT one model for all)

Orchestration needs strong reasoning; bulk worker turns want a cheaper, fast coding router. Route
by role (Anthropic multi-agent: Opus orchestrator + Sonnet workers, §5):

| Role | Model | Why |
|---|---|---|
| **@project-manager** (orchestrator) | a strong reasoner — `anthropic/claude-sonnet-4-6` (the seed default, live here) or per `../models/frontier-and-specialists.md` routing matrix | triage / team-shaping / synthesis is reasoning-heavy |
| **@engineer / workers** (bulk turns) | a coding router — `openrouter/xiaomi/mimo-v2.5-pro` (this deploy's configured default) or `openrouter/moonshotai/kimi-k2.6` (small) — see `../models/coding-routers.md` | high-volume implementation; cost + speed matter |
| **@qa / review** | coding router, or the orchestrator model for high-stakes gates | evidence-checking |

> The deploy's OpenCode default is `openrouter/xiaomi/mimo-v2.5-pro` (what un-pinned sessions use).
> A seeded agent's model is set per-agent (`default_model`); leave blank to inherit the session default.
> **Never seed a model that isn't configured** — a dead `provider/model` (e.g. the removed
> `kortix-yolo/*`, [[decisions]] D-020) silently bricks the agent. Verify against
> `GET /config/providers` on the sandbox before assigning.

## Persona best practices (apply Anthropic, don't reinvent)

The seeded PM persona (`pmPersonaBody` in `project-v2-seed.ts`) already models most of this — match it:

- **Right altitude (Goldilocks).** Specific enough to guide, flexible enough to use judgment.
  Heuristics > brittle if-else enumerations. (`anthropic-principles.md` §"Goldilocks".)
- **Examples > edge-case rules.** 3-5 canonical REJECTED/ACCEPTED exemplars beat 20 "NEVER" rules
  (§"Goldilocks", §6). The PM persona's `"Proposing @engineer + @qa — scope is well-defined"`
  lines are exactly this.
- **Smallest high-signal prompt.** Every token competes for the attention budget (§1). Don't pad.
- **Evidence over verdict, one summary comment.** `"Ran pnpm build → exit 0"` beats `"✅ looks
  good"`. Long artefacts go in the ticket body / repo, linked — not the comment (§4).
- **Stale-harness awareness (§6).** Newer models need LESS prescriptive scaffolding. Audit
  enumerated `NEVER`-bans and `"if you catch yourself…"` counters when you bump the agent's model
  — some become dead weight that overrides good judgment.
- **Execution mode:** `per_ticket` (reuse one session per ticket; concurrent mentions queue) is the
  default. `per_assignment` (fresh session each fire) only when isolation per run matters.
- **tool_groups:** `project_action` (work tickets) for workers; add `project_manage` (configure
  columns/team/fields) ONLY for the orchestrator.

## Why a project's Team tab can be empty (debug)

1. **Never seeded.** `seedV2Project` runs ONLY via `POST /kortix/projects/:id/seed-v2`. The boot
   v1→v2 migration only does `UPDATE structure_version=2` — it does NOT seed → "zombie v2"
   (v2 flag, 0 columns, 0 agents). Fix: seed it. (D-024 fixes the migration to seed.)
2. **Orphan session-agents.** Files exist under `.opencode/agent/` but no `project_agents` rows →
   invisible to the Team (see the two-kinds table above).
3. **Dead model.** The agent exists but its `default_model` points at an unconfigured provider.

## Best way, in one line

Seed the project (`seed-v2`) → the @project-manager (strong model) exists → it shapes the smallest
worker team (coding-router models) per ticket → the board flow gates via @qa in review. Create team
agents through the **Team tab / seed**, never by hand-writing `.opencode/agent` files.
