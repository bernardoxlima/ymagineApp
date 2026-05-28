# Model profiles — runtime brains for ymagineApp (Kortix/Suna fork)

> Research date: 2026-05-28
> Audience: Claude Code (writing/editing system prompts, persona prompts, and agent definitions for the END APP)
> Routing layer: OpenRouter (Suna's `apps/api/src/router/config/models.ts` maps friendly IDs to OpenRouter slugs)
> Scope: behavioral guidance for the runtime LLMs, not Anthropic Claude as the assistant building the app

---

## How to read this doc

1. Per-model sections give identity, capabilities, prompting style, failure modes, OpenRouter pricing, and Kortix fit.
2. The **Comparison matrix** lets you pick by axis (context, cost, tool format).
3. **Routing recommendations** map common Kortix patterns (orchestrator+workers, RAG persona, computer-use, long-context summarization) to specific models.
4. **Cross-cutting tool-use compatibility** flags where OpenCode's tool format does or does not translate cleanly.

Where official sources do not publish a fact, the doc says so explicitly. Do not infer behavior from third-party blogs.

---

## Moonshot AI · Kimi K2.6

**Identity**

- OpenRouter ID: `moonshotai/kimi-k2.6` (paid) and `moonshotai/kimi-k2.6:free` (free tier)
- Provider native ID: `kimi-k2.6` at `https://api.moonshot.ai/v1` (OpenAI-compatible)
- HuggingFace: `moonshotai/Kimi-K2.6`
- Released: 2026-04-20
- Modalities: text, image, video (video chat is experimental and **official API only** — vLLM/SGLang deployments do not support video)
- License: Modified MIT (weights + code open-source)

**Capabilities**

- Total params: 1T, active 32B / token (MoE: 384 experts, 8 selected + 1 shared, 61 layers, MLA attention, SwiGLU, 160K vocab)
- Context window: 256K input tokens (262,144); on OpenRouter listed as 262K
- Max output: API default 32,768 tokens; range 4,096–98,304 depending on task
- Tool format: **OpenAI-compatible function calling** (standard `tools` + `tool_choice` JSON schema). Native interleaved-thinking + multi-step tool calling like K2 Thinking.
- Streaming: yes
- Caching: not documented on the K2.6 model card; tech blog does not mention prompt caching equivalent. Suna's router has a `cacheReadPer1M: 0.225` line for K2.5 — treat caching as platform-side (OpenRouter / Moonshot tier) not model-card-guaranteed.
- Quantization: native INT4 (ships INT4)
- Vision encoder: MoonViT, 400M params

**Lab's claimed strengths**

- Long-horizon coding across Python, Rust, Go; demo of optimizing a Zig inference loop over a 12+ hour autonomous run
- "Agent Swarm" — up to 300 sub-agents, 4,000 coordinated steps in one run (3× K2.5 capacity)
- Coding-driven UI/UX: prompts/visual inputs → production-ready interfaces, animations, full-stack workflows with auth and DB
- 24/7 background agent reliability (OpenClaw, Hermes); recovery on multi-day autonomous tasks
- "Claw Groups" preview: heterogeneous agents + humans share a workspace under a coordinator

**Headline benchmarks (from official HF model card)**

| Category | Benchmark | Score |
|---|---|---|
| Coding | SWE-Bench Pro (avg of 10 runs) | 58.6% |
| Coding | SWE-Bench Verified | 80.2% |
| Coding | SWE-Bench Multilingual | 76.7% |
| Coding | Terminal-Bench 2.0 (preserve thinking) | 66.7% |
| Coding | LiveCodeBench v6 | 89.6% |
| Reasoning | AIME 2026 | 96.4% |
| Reasoning | GPQA-Diamond | 90.5% |
| Vision | MMMU-Pro (w/ thinking) | 79.4% |
| Agentic | HLE-Full w/ tools | 54.0% |
| Agentic | BrowseComp | 83.2% |
| Agentic | BrowseComp w/ Agent Swarm (300 sub-agents, 4,000 steps) | 86.3% |
| Agentic | OSWorld-Verified | 73.1% |

**How to prompt it**

- Default system prompt the lab ships: `You are Kimi, an AI assistant created by Moonshot AI.` Override safely — system role is respected.
- **Sampling parameters are LOCKED on the official API**: thinking mode requires `temperature=1.0`, `top_p=1.0`; non-thinking requires `temperature=0.6`, `top_p=0.95`. Custom values produce errors. `n`, `presence_penalty`, `frequency_penalty` are also locked. (Open weights via vLLM/SGLang allow customization, but Moonshot recommends sticking to the locked values for fidelity.)
- Two modes via `extra_body`:
  - Thinking (default): `{"thinking": {"type": "enabled"}}`
  - Instant (off): `{"thinking": {"type": "disabled"}}`
  - Multi-turn preserve: `{"thinking": {"type": "enabled", "keep": "all"}}`
- For thinking mode + tools: `tool_choice` must be `"auto"` or `"none"` only.
- Multi-step tool calls **must preserve `reasoning_content`** across turns or chain-of-thought is dropped.
- The built-in `$web_search` tool is incompatible with thinking mode (use external search tools instead).
- Prompting style preference: standard markdown + JSON tool schemas; no XML wrapping required. Persona prompts (e.g. "respond as Author X") work via system message.

**Known failure modes (from official sources)**

- No explicit "Limitations" section on the model card. Lab does not publish hallucination rates.
- Video input is experimental; only the official API supports it. Third-party deployments will silently drop video.
- Context management on agentic tasks is the user's responsibility past 256K — for BrowseComp the team used a "discard-all" reset strategy; for DeepSearchQA they let overflow fail; for WideSearch they truncated to recent tool messages.
- `preserve_thinking` may not behave identically on vLLM/SGLang vs official API.

**Pricing (OpenRouter, 2026-05-28)**

- Input: $0.73 / 1M
- Output: $3.49 / 1M
- Free tier available at `moonshotai/kimi-k2.6:free` (0/0 with rate limits)

**Best Kortix use case**

- Primary worker for OpenCode-runtime coding agents and Agent Swarm orchestration patterns. The K2.6 architecture is designed around the same pattern Kortix already exposes (coordinator + sub-agents). When you need an agent that runs a multi-hour autonomous coding/search loop with hundreds of tool calls, K2.6 is the cost/perf sweet spot.
- Strong second choice for persona "respond as Author X" RAG agents when a 256K context is enough — the OpenAI-compatible tool format means `consultar_autor`-style tools plug in with no schema translation.
- Avoid when: you need >256K context (use MiMo-V2.5-Pro or Grok 4.20), or when you need locked temperature for deterministic outputs (Moonshot's locked sampling enforces creativity).

**Sources**

- HF model card: https://huggingface.co/moonshotai/Kimi-K2.6
- Moonshot tech blog: https://www.kimi.com/blog/kimi-k2-6
- API quickstart: https://platform.kimi.ai/docs/guide/kimi-k2-6-quickstart
- OpenRouter listing: https://openrouter.ai/moonshotai/kimi-k2.6
- OpenRouter free tier: https://openrouter.ai/moonshotai/kimi-k2.6:free
- Product page: https://www.kimi.com/ai-models/kimi-k2-6

---

## xAI · Grok 4.20 (base)

**Identity**

- OpenRouter ID: `x-ai/grok-4.20`
- xAI native IDs: `grok-4.20-0309-reasoning`, `grok-4.20-0309-non-reasoning` (and aliases like `grok-4.20`)
- Released: 2026-02-17 (beta), 2026-03-31 (GA on OpenRouter)
- Modalities: text + image input → text output
- Knowledge cutoff: November 2024 per the xAI docs (Grok 3/4 family value)

**Capabilities**

- Context window: 2,000,000 tokens (2M)
- Max output: not explicitly published; the docs page does not list a hard cap
- Tool format: OpenAI-style function calling, structured outputs, parallel tool calls supported
- Reasoning toggle: `reasoning.enabled` (on/off) and `reasoning.effort` (low/medium/high/xhigh)
- Streaming: yes (Responses API and Chat Completions)
- Caching: cached input billed at $0.20/1M (provider-managed prompt cache; no manual cache write fee on the listed pricing)
- Compatible APIs: xAI SDK, OpenAI SDK, Anthropic SDK (via xAI compatibility), REST, Chat Completions, Responses API
- Rate limit (docs): 1,800 RPM, 10M tokens/min across us-east-1 and eu-west-1

**Lab's claimed strengths**

- "Industry-leading speed and agentic tool calling capabilities"
- "Lowest hallucination rate on the market" with strict prompt adherence
- Function calling + structured outputs + reasoning all first-class
- xAI emphasizes parallel tool calling and reliable structured output

**How to prompt it**

- System role respected. Standard OpenAI message format works.
- Reasoning is OFF by default; opt in with `reasoning.enabled = true` or set `reasoning.effort`.
- Strict prompt adherence is a feature — instructions are followed literally. Spell out edge cases.
- Tool schemas are OpenAI-style JSON; no special wrapping.
- For long-context (anything past ~500K), expect provider-side cache to help when prompts share a stable prefix; design system prompts with the cacheable prefix first, then the per-call delta.

**Known failure modes (from official sources)**

- xAI has not published a dedicated Grok 4.20 model card on `data.x.ai` (last model card is Grok 4.1, 2025-11-17). Limitations below are inherited from Grok 4.1 documentation and the docs site.
- Knowledge cutoff November 2024 — without web/x_search tools the model has no current-events grounding.
- No explicit guidance on context-length degradation past 1M.

**Pricing (OpenRouter, 2026-05-28)**

- Input: $1.25 / 1M
- Cached input: $0.20 / 1M (per xAI docs)
- Output: $2.50 / 1M

**Best Kortix use case**

- Long-context summarization and document analysis (2M context > everything except MiMo-Pro)
- Coding worker when you need strict instruction following + structured JSON output (e.g. agent emits a typed action plan)
- Fast generalist for tool-using agents that need parallel tool calls

**Sources**

- xAI models docs: https://docs.x.ai/developers/models
- xAI Grok 4.20 (reasoning) docs: https://docs.x.ai/developers/models/grok-4.20
- OpenRouter listing: https://openrouter.ai/x-ai/grok-4.20
- xAI release notes: https://docs.x.ai/developers/release-notes
- Grok 4.1 model card (prior version, for limitations baseline): https://data.x.ai/2025-11-17-grok-4-1-model-card.pdf

---

## xAI · Grok 4.20 Multi-Agent (the multi-agent variant)

**Identity**

- OpenRouter ID: `x-ai/grok-4.20-multi-agent` (also `x-ai/grok-4.20-multi-agent-beta` for the beta channel)
- xAI native ID: `grok-4.20-multi-agent-0309`
- Released: 2026-02-17 (beta), 2026-03-31 (GA)
- This IS what xAI calls the multi-agent variant — explicit standalone model, **not** "Grok Heavy" (Heavy is the consumer subscription tier that gives end-users 16-agent access; the developer API surface is `grok-4.20-multi-agent`).

**Capabilities**

- Context window: 2M tokens (per xAI docs page for the model)
  - Note: OpenRouter's listing also shows 2M; older xAI doc pages list 1M for the `-0309` SKU; assume **2M** as the current public figure.
- Output: **`max_tokens` is unsupported** — the model writes until its own stop logic
- Architecture: four specialized "agents" (collaborative replicas of the underlying Grok 4.20 backbone) running in parallel at low/medium effort; 16 at high/xhigh
- Agent count parameter: `agent_count` (xAI SDK: 4 or 16) OR `reasoning.effort` (low/medium → 4, high/xhigh → 16) for OpenAI/REST/Vercel SDKs
- The four-agent design uses a Captain/coordinator + specialists pattern (xAI describes this as Grok/Captain handling decomposition + final synthesis with worker agents for search, math/code, and adversarial review)
- Modalities: text in/out (image input not listed for multi-agent)

**Critical compatibility constraints (from xAI docs)**

- **NOT compatible with Chat Completions API** — Responses API only (xAI SDK, OpenAI SDK via Responses, REST)
- **No client-side / custom tools** — only xAI built-ins: `web_search`, `x_search`, `code_execution`, `collections_search`
- **`max_tokens` parameter unsupported**
- Sub-agent reasoning is encrypted by default; only leader output returns unless `use_encrypted_content` is set
- Currently flagged beta; API surface may change

**Lab's claimed strengths**

- Reduces hallucination ~65% (12% → 4.2%) vs single-pass Grok 4.1 because of the internal peer-review loop
- Designed for deep research, multi-source synthesis, long-running pipelines
- Marginal compute cost ~1.5–2.5× single pass (not 4×) because all agents share the backbone — but tokens billed include all sub-agent reasoning

**How to prompt it**

- Provide explicit scope + desired output structure (the Captain decomposes the prompt, so vague prompts produce vague decompositions)
- Ask for organized output formats (bulleted/structured) — the synthesizer respects format hints
- Specify the type of evidence you want (citations, code, calculations)
- For very complex topics, break into multi-turn conversations
- xAI's prompting guide explicitly recommends "contextual constraints" — system prompts should bound the search/reasoning space

**Known failure modes (from official sources)**

- All four/sixteen agents bill together — runaway token cost on long prompts
- Cannot use your own tools; if your Kortix agent depends on `consultar_autor` or any custom function, this model **will not work** — use base Grok 4.20 instead
- Beta status: xAI explicitly says the API may change

**Pricing (OpenRouter, 2026-05-28)**

- Input: $2.00 / 1M
- Output: $6.00 / 1M
- **All sub-agent tokens count** (input + output + reasoning) — real cost per turn is multiples of a single-agent call
- Built-in tool calls (`web_search` etc.) billed separately

**Best Kortix use case**

- Deep research agents that need to search broadly, cross-reference, and synthesize — and that are happy with xAI's built-in search tools
- An "investigator" persona used as a one-shot at the start of a workflow to produce a grounded brief that other agents then operate on
- **Not** the right pick for: anything using your own tools (Kortix's `consultar_autor`, file tools, code editors), anything on Chat Completions, anything where you need to cap output

**Sources**

- xAI multi-agent docs: https://docs.x.ai/developers/model-capabilities/text/multi-agent
- xAI Grok 4.20 Multi-Agent Beta model docs: https://docs.x.ai/developers/models/grok-4.20-multi-agent-beta-0309
- OpenRouter listing: https://openrouter.ai/x-ai/grok-4.20-multi-agent

---

## Xiaomi · MiMo-V2.5 and MiMo-V2.5-Pro

> Two distinct SKUs — V2.5 is the omnimodal model, V2.5-Pro is the flagship agentic model. Both share the V2.5 series architecture lineage but differ in size and modality coverage.

### MiMo-V2.5-Pro (flagship)

**Identity**

- OpenRouter ID: `xiaomi/mimo-v2.5-pro`
- Provider IDs: at `https://api.xiaomimimo.com/v1` (OpenAI-compatible) and also offers an Anthropic-compatible endpoint
- HuggingFace: `XiaomiMiMo/MiMo-V2.5-Pro` and `XiaomiMiMo/MiMo-V2.5-Pro-Base`
- Released: 2026-04-22
- Modalities: text-primary agent; tool-use heavy
- License: MIT

**Capabilities**

- Total params: 1.02T, active 42B / token (MoE: 384 routed experts, 8 per token, 70 layers — 1 dense + 69 MoE)
- Attention: hybrid sliding-window (128-token window) + global, 6:1 ratio; 128 heads, 8 KV heads (GQA)
- Context window: **1M tokens** (1,048,576) — Pro variant; base is 256K
- Max output: not explicitly published as a hard cap on the model card
- Multi-Token Prediction (MTP): 3 lightweight modules → reported 3× output speed
- Tool format: OpenAI-compatible function calling (and Anthropic-compatible endpoint available)
- Streaming: yes
- Caching: not documented on model card; platform pricing has a nighttime discount (00:00–08:00 Beijing) and an annual plan
- Inference: SGLang officially recommended; vLLM supported; FP8 weights
- Recommended sampling (vLLM): `temperature=1.0`, `top_p=0.95`

**Lab's claimed strengths**

- "Frontier-level agentic capability with high token efficiency"
- Sustains 1,000+ tool-call agentic tasks (Xiaomi demos a Rust SysY compiler completed end-to-end in 4.3 hours with 672 tool calls, perfect 233/233 test score)
- "Harness awareness" — actively manages its own context window
- ~70K tokens/trajectory on ClawEval — Xiaomi claims 40–60% fewer tokens than Claude Opus 4.6, Gemini 3.1 Pro, and GPT-5.4 on agentic trajectories
- Three-stage post-training: SFT → Domain-Specialized RL (math, safety, agentic tool-use) → MOPD (Multi-Teacher On-Policy Distillation)

**Benchmarks (from official HF card / Xiaomi)**

| Benchmark | Score |
|---|---|
| SWE-Bench Pro | 57.2% (exceeds Claude Opus 4.6 at 53.4%; within 0.5 of GPT-5.4 at 57.7%) |
| Claw-Eval General | 62.3 |
| Terminal-Bench 2 | 65.8 |
| GSM8K (8-shot, base) | 99.6 |
| MATH (4-shot, base) | 86.2 |
| HumanEval+ (1-shot, base) | 75.6 |
| MMLU (5-shot, base) | 89.4 |

**How to prompt it**

- OpenAI-compatible API: standard system/user/assistant message roles
- Anthropic-compatible endpoint also available — useful if you want to reuse Claude-style XML prompts directly
- Recommended `temperature=1.0`, `top_p=0.95` (open weights) — provider API may not enforce
- The model exhibits "harness awareness" — give it an explicit harness/environment description in the system prompt and it will manage its own context budget
- For long-horizon agent runs, design the system prompt around the tool inventory; Xiaomi's benchmarks were run with explicit tool lists in-context

**Known failure modes (from official sources)**

- Model card does not publish a "Limitations" section
- No published hallucination rate
- Xiaomi explicitly notes that V2.5 series is in "public beta" — API changes possible
- Multimodal coverage on V2.5-Pro is narrower than V2.5 (which is the omnimodal SKU); use V2.5 for vision/audio

**Pricing (OpenRouter, 2026-05-28)**

- Input: $0.435 / 1M
- Output: $0.87 / 1M
- Provider platform: 2× credit rate vs MiMo-V2.5 (1×); 20% discount nighttime (00:00–08:00 Beijing)

**Best Kortix use case**

- **The clear winner for very-long-horizon coding agents and multi-thousand-tool-call workflows.** Xiaomi specifically engineered Pro for 1,000+ tool-call sessions and reports best-in-class token efficiency.
- Coder worker when you need 1M context (e.g. ingest a whole repo)
- Agent that builds its own harness (e.g. "set up a project, write code, run tests, iterate")

**Sources**

- HF model card: https://huggingface.co/XiaomiMiMo/MiMo-V2.5-Pro
- Xiaomi product page: https://mimo.xiaomi.com/mimo-v2-5-pro/
- Xiaomi platform docs: https://platform.xiaomimimo.com/docs/en-US/api/chat/openai-api
- Xiaomi release announcement: https://platform.xiaomimimo.com/docs/en-US/news/v2.5-news
- OpenRouter listing: https://openrouter.ai/xiaomi/mimo-v2.5-pro

### MiMo-V2.5 (omnimodal, cost-efficient)

**Identity**

- OpenRouter ID: `xiaomi/mimo-v2.5`
- HuggingFace: `XiaomiMiMo/MiMo-V2.5`
- Released: 2026-04-22
- Modalities: text + image + video + audio (native omnimodal — V2.5 is the multimodal SKU; V2.5-Pro is text+tools)
- License: MIT

**Capabilities**

- Total params: 310B, active 15B / token (Sparse MoE: 256 routed experts, 8 per token, 48 layers — 1 dense + 47 MoE)
- Attention: hybrid sliding-window (39 layers, 128 window) + global (9 layers); 5:1 ratio; ~6× KV-cache reduction via learnable attention sink
- Context window: up to 1M tokens (training: 32K → 256K → 1M progressive expansion)
- Vision encoder: 729M ViT (24 SWA + 4 Full layers)
- Audio encoder: 261M Audio Transformer (12 SWA + 12 Full layers)
- MTP: 329M parameters, 3 layers
- Training: ~48T tokens FP8 mixed precision
- Tool format: OpenAI-compatible (and Anthropic-compatible endpoint)
- Streaming: yes

**Lab's claimed strengths**

- "Pro-level agentic performance at roughly half the inference cost"
- Strong visual + audio understanding; matches Gemini 3 Pro on video tasks per Xiaomi
- Claw-Eval Multimodal: 23.8; Claw-Eval General: 62.1; SWE-Bench Pro: 56.1; Terminal-Bench 2: 65.8

**How to prompt it**

- Same OpenAI/Anthropic-compatible interface as Pro
- Use this when you need vision or audio (Pro is text+tools focused)
- For pure text agentic workloads where Pro is overkill (or budget-bound), V2.5 is the value play

**Pricing (OpenRouter, 2026-05-28)**

- Input: $0.14 / 1M
- Output: $0.28 / 1M (roughly 3× cheaper than V2.5-Pro on input)

**Best Kortix use case**

- Cheap multimodal worker (image/video/audio ingestion in an agent loop)
- Bulk RAG / persona "respond as Author X" with image attachments
- Cost-bound long-context summarization with multimodal inputs

**Sources**

- HF model card: https://huggingface.co/XiaomiMiMo/MiMo-V2.5
- Xiaomi product page: https://mimo.xiaomi.com/mimo-v2-5/
- OpenRouter listing: https://openrouter.ai/xiaomi/mimo-v2.5

---

## Anthropic · Claude Opus 4.7 / 4.6 and Sonnet 4.6 (positional reference only)

> Quick reference for comparative positioning in the Kortix stack. Suna's `core/kortix-master/opencode/opencode.jsonc` defaults to `claude-sonnet-4-6` via Anthropic provider. Note: Anthropic also has Opus 4.8 GA as of recent docs — included for completeness.

### Claude Opus 4.7

- API ID: `claude-opus-4-7`
- Released: 2026-04-16
- Context: 1M tokens (on Claude API, Bedrock, Vertex AI; 200K on Microsoft Foundry)
- Max output: 128K tokens
- Pricing: $5 / 1M input, $25 / 1M output (unchanged from 4.6)
- Sampling: **`temperature`, `top_p`, `top_k` to non-default values returns HTTP 400** (Opus 4.7+ only supports defaults)
- Thinking: adaptive only; budget-tokens API is deprecated (`thinking: {"type":"adaptive"}` + `effort: low/medium/high/xhigh/max`)
- Vision: 2,576px long edge (~3.75 MP) — 3× prior models
- Strengths per Anthropic: advanced software engineering, long-running agentic workflows, self-verification of outputs, instruction following ("more literal" — re-tuning may be needed when migrating from 4.6)
- Caching: standard Anthropic prompt caching
- Tool format: Anthropic-native (XML-tagged tools or the Messages tool schema)

### Claude Opus 4.6

- API ID: `claude-opus-4-6`
- Released: 2026-02-05
- Context: 1M tokens (beta) / standard 200K; max output 128K
- Pricing: $5/$25 per 1M (and $10/$37.50 above 200K input)
- Strengths: top Terminal-Bench 2.0 score; leads HLE; +144 Elo over GPT-5.2 on GDPval-AA
- New features at launch: adaptive thinking, four effort levels (low/medium/high/max), context compaction, Agent Teams in Claude Code

### Claude Sonnet 4.6

- API ID: `claude-sonnet-4-6`
- Released: 2026-02-17
- Context: 1M tokens (beta GA from 2026-03-13)
- Pricing: $3 / 1M input, $15 / 1M output
- Strengths: coding + computer-use upgrade; OSWorld substantial gains; preferred over Sonnet 4.5 ~70% of the time and over Opus 4.5 ~59%
- Adaptive thinking + extended thinking + context compaction (beta)
- **This is Suna's current default in `opencode.jsonc`** (Anthropic provider, `claude-sonnet-4-6`)

### Claude Opus 4.8 (newer than 4.7, for completeness)

- API ID: `claude-opus-4-8`
- Builds on 4.7; same constraints (no temperature/top_p/top_k custom; adaptive thinking only)
- New: mid-conversation `role: "system"` messages (preserves prompt cache on long agentic loops); `effort` default is `high` on 4.8; fast mode (`speed: "fast"`) research preview; prompt-cache minimum dropped to 1,024 tokens
- Targets fewer wasted thinking tokens, better tool triggering, better compaction recovery

**How to prompt the 4.7+ Claude line for Kortix agents**

- Instructions are followed LITERALLY — be explicit about scope, format, when NOT to act
- Tool definitions go in the `tools` array; tool calls return as content blocks; Anthropic-native format (not OpenAI JSON wrapping)
- Use system role for persona + style; user/assistant for the loop
- For long-running agents, use mid-conversation system messages (Opus 4.8) to update instructions without invalidating cache
- Set `thinking: {"type":"adaptive"}` to let the model decide when to reason

**Sources**

- Opus 4.7 announcement: https://www.anthropic.com/news/claude-opus-4-7
- Opus 4.6 announcement: https://www.anthropic.com/news/claude-opus-4-6
- Sonnet 4.6 announcement: https://www.anthropic.com/news/claude-sonnet-4-6
- What's new in Opus 4.8: https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-8

---

## Comparison matrix

| Model | OpenRouter ID | Context | Max out | Tool format | $/1M in | $/1M out | Primary strength |
|---|---|---|---|---|---|---|---|
| Kimi K2.6 | `moonshotai/kimi-k2.6` | 256K | 32K default (4K–98K range) | OpenAI JSON, native thinking+tools | $0.73 | $3.49 | Long-horizon coding + Agent Swarm |
| Kimi K2.6 (free) | `moonshotai/kimi-k2.6:free` | 256K | — | OpenAI JSON | $0 | $0 | Prototyping |
| Grok 4.20 | `x-ai/grok-4.20` | 2M | not capped | OpenAI JSON, parallel tools, structured outputs | $1.25 (cache $0.20) | $2.50 | Long-context + strict instruction following |
| Grok 4.20 Multi-Agent | `x-ai/grok-4.20-multi-agent` | 2M | `max_tokens` unsupported | Built-in xAI tools only; Responses API only | $2.00 | $6.00 (×4 or ×16 agents billed) | Deep research with sub-agent debate |
| MiMo-V2.5-Pro | `xiaomi/mimo-v2.5-pro` | 1M | not capped | OpenAI + Anthropic compatible | $0.435 | $0.87 | 1,000+ tool-call coding agents; token-efficient |
| MiMo-V2.5 | `xiaomi/mimo-v2.5` | 1M | not capped | OpenAI + Anthropic compatible | $0.14 | $0.28 | Cheapest omnimodal (image/video/audio) |
| Claude Opus 4.7 | `claude-opus-4-7` (Anthropic direct) | 1M | 128K | Anthropic-native | $5 | $25 | Premium coding + agentic; literal instructions |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` (Anthropic direct) | 1M | — | Anthropic-native | $3 | $15 | Default Kortix model; coding + computer-use |
| Claude Opus 4.8 | `claude-opus-4-8` (Anthropic direct) | 1M | 128K | Anthropic-native, mid-convo system msgs | $5 | $25 | Latest premium, better tool triggering |

Cost intuition (per 1M tokens, in+out at 1:1 ratio):
- Cheapest: MiMo-V2.5 ($0.42 combined) < MiMo-V2.5-Pro ($1.305) < Kimi K2.6 ($4.22) < Grok 4.20 ($3.75) < Sonnet 4.6 ($18) < Grok 4.20 Multi-Agent ($8 per agent × N) < Opus 4.7/4.8 ($30)

---

## Routing recommendations for Kortix

### Pattern 1 — Orchestrator + workers (Suna's default Agent Teams)

- **Orchestrator (planner that decomposes tasks and dispatches tools):** Claude Sonnet 4.6 (current Suna default) OR Kimi K2.6 in thinking mode. Sonnet 4.6 has the better orchestration-style track record + literal instruction following; K2.6 is the open-weight equivalent with native swarm coordination.
- **Worker that runs tools (file ops, search, code):** Kimi K2.6 (cheap, fast, OpenAI tool format) OR MiMo-V2.5-Pro when the worker needs >256K context.
- **Worker that ingests an entire repo / long docs:** MiMo-V2.5-Pro (1M context, token-efficient) OR Grok 4.20 (2M context, structured outputs).

### Pattern 2 — Persona "respond as Author X" RAG agent using `consultar_autor`

> The persona answers as a specific author, grounded in retrieved passages via a Kortix-custom tool.

- **Pick: Kimi K2.6** (paid `moonshotai/kimi-k2.6`).
- Why: OpenAI-compatible tools (no schema translation for `consultar_autor`), persona via system message, 256K context covers a large retrieved passage set, cost is reasonable for hundreds of queries per day, and the thinking mode helps with stylistic mimicry.
- Alternative: Claude Sonnet 4.6 if you want Anthropic-style XML persona prompts (more literal style adherence at 3.5× cost).
- **Do NOT pick Grok 4.20 Multi-Agent** — your `consultar_autor` is a custom tool, and multi-agent only supports xAI built-ins.

### Pattern 3 — Long-context summarization / "ingest a corpus and write a report"

- **Pick: Grok 4.20 (base)** — 2M context, cheapest at scale per token-in, and the cached-input price ($0.20/1M) helps if the corpus is reused.
- Alternative: MiMo-V2.5-Pro if you want sub-$1 per million and the corpus fits in 1M.

### Pattern 4 — Deep research with web/x search (one-shot brief generation)

- **Pick: Grok 4.20 Multi-Agent** — this is what it's purpose-built for. 4 or 16 agents debate, native `web_search` + `x_search`, output is grounded and de-hallucinated.
- Wrapper must use Responses API, NOT Chat Completions. Make peace with no custom tools.
- Output is then fed to a downstream worker (Kimi K2.6 / MiMo-V2.5-Pro) that does the per-step execution.

### Pattern 5 — Computer-use agent (OSWorld-style)

- **Pick: Claude Sonnet 4.6 or Opus 4.7** — Anthropic has the published OSWorld leads. Sonnet 4.6 is the value choice; Opus 4.7 when the task is hard.
- Alternative: Kimi K2.6 (OSWorld-Verified 73.1% — competitive).

### Pattern 6 — Cheap fallback / mass background jobs

- **Pick: MiMo-V2.5** ($0.14 in / $0.28 out) — 3× cheaper than K2.6, omnimodal, 1M context.
- Or `moonshotai/kimi-k2.6:free` for free-tier prototyping (rate-limited; don't depend on it in prod).

### Pattern 7 — Multi-thousand tool-call autonomous coding session

- **Pick: MiMo-V2.5-Pro** — Xiaomi specifically engineered it for 1,000+ tool calls and demonstrated a 672-tool-call Rust compiler build in 4.3 hours. Token efficiency is its differentiator.
- Alternative: Kimi K2.6 with Agent Swarm if you need parallel sub-agents (different shape; Pro is a serial deep loop, K2.6 swarm is parallel breadth).

---

## Cross-cutting tool-use compatibility note

OpenCode (and Suna's `@ai-sdk/openai-compatible` plumbing) uses **OpenAI-style function calling** as its lingua franca: tools defined as `{ type: "function", function: { name, description, parameters: JSON-schema } }` and tool calls returned in `tool_calls`.

| Model | OpenCode tool format works as-is? | Translation needed? |
|---|---|---|
| Kimi K2.6 | YES (OpenAI-compatible API) | None |
| Grok 4.20 (base) | YES (OpenAI-compatible, structured outputs, parallel tools) | None |
| Grok 4.20 Multi-Agent | **NO** — only xAI built-in tools (`web_search`, `x_search`, `code_execution`, `collections_search`); **Chat Completions not supported (Responses API only)** | If you need custom Kortix tools, route to base `grok-4.20` instead |
| MiMo-V2.5 / V2.5-Pro | YES (OpenAI-compatible) and also offers Anthropic-compatible endpoint | None for OpenAI; optional Anthropic-style for XML prompt re-use |
| Claude Sonnet 4.6 / Opus 4.7 / 4.8 | NO — Anthropic-native tool schema, not OpenAI JSON | OpenCode/Suna already wraps via `@ai-sdk/anthropic` — translation handled by the SDK |

**Practical implications for the agent builder:**

1. If a Kortix agent declares custom tools (e.g. `consultar_autor`, file IO, custom MCP), you can ONLY route it to: Kimi K2.6, Grok 4.20 base, MiMo-V2.5, MiMo-V2.5-Pro, Claude Sonnet/Opus.
2. Grok 4.20 Multi-Agent is reserved for "this is a research subtask, use xAI tools only" — wrap it as a single-shot sub-call, not as the agent's main loop.
3. Anthropic tools are translated by the Vercel AI SDK adapter — no extra code, but be aware that tool-call streaming semantics differ subtly from the OpenAI path.

---

## Operational notes for Suna integration (as of 2026-05-28)

These are observations from the current repo state, not user requests:

- `apps/api/src/router/config/models.ts` registers `moonshotai/kimi-k2.5`, `minimax/minimax-m2.7`, `minimax/minimax-m2.5`, `z-ai/glm-5-turbo`. **K2.6 is not yet wired into the router** — the registry still maps `kortix/kimi` to `moonshotai/kimi-k2.5`. Adding K2.6 means adding `moonshotai/kimi-k2.6` (and the `:free` SKU if desired) with pricing $0.73 / $3.49 and context 262144.
- `core/kortix-master/opencode/opencode.jsonc` actively configures the Anthropic provider with `claude-sonnet-4-6` as the only registered model; the Kortix-router block is commented out with K2.5 entries. To adopt K2.6 as the default OpenCode model:
  - Uncomment the `kortix` provider block
  - Update the `kimi` entry to `id: "moonshotai/kimi-k2.6"`, `cost: { input: 0.73, output: 3.49 }`, `limit: { context: 262144, output: 98304 }`
  - Match the router-side change above
- MiMo-V2.5/Pro and Grok 4.20/Multi-Agent are NOT in the Suna registry — adding them is straightforward (provider/model format, OpenRouter slug above).

---

## Things official sources do not specify (flag list)

Be honest about gaps when writing prompts that depend on these:

- **Kimi K2.6**: no published "Limitations" section, no hallucination rate, no documented prompt-caching equivalent on the model card (Suna's router treats Moonshot platform caching as the source of $0.225/1M cached-read figure — that's a Suna heuristic, not a Moonshot spec).
- **Grok 4.20** and **4.20 Multi-Agent**: no dedicated xAI model card PDF (last published card is Grok 4.1, 2025-11-17). Limitations inherited from 4.1 baseline. Max output not explicitly capped in docs.
- **MiMo-V2.5 / V2.5-Pro**: no published Limitations section; no published hallucination rate. Xiaomi positions the V2.5 series as "public beta" and notes API may change. No arXiv tech report specific to V2.5-Pro yet (the closest is the V2-Flash tech report at arXiv 2601.02780).
- **Claude Opus 4.7/4.8 sampling lockout**: explicitly returns HTTP 400 if you set `temperature`, `top_p`, or `top_k`. Migrating prompts that rely on those will fail.

---

## Quick decision tree for "which model should this Kortix agent use?"

```
Does the agent use custom tools (any tool not in xAI's built-in 4)?
├── YES → exclude Grok 4.20 Multi-Agent
│   Does the agent need >256K context?
│   ├── YES → MiMo-V2.5-Pro (1M, cheap) or Grok 4.20 (2M, more $)
│   └── NO → Kimi K2.6 (default), Claude Sonnet 4.6 (premium), MiMo-V2.5 (cheapest + multimodal)
└── NO (xAI built-in tools are enough)
    Is this a deep-research one-shot?
    ├── YES → Grok 4.20 Multi-Agent (4 agents low/med, 16 high/xhigh)
    └── NO → see "YES" branch above

Premium quality / hard reasoning?
└── Claude Opus 4.7 or 4.8 (literal instruction following, no custom temperature)

Cost-bound bulk work?
└── MiMo-V2.5 (cheapest) > Kimi K2.6:free (rate-limited) > MiMo-V2.5-Pro > Kimi K2.6 paid
```

---

## End notes

- Pricing snapshot is 2026-05-28; OpenRouter prices fluctuate, treat the in-doc figures as the floor for budget planning.
- All "Kortix-specific" recommendations assume the Suna OpenCode runtime + Vercel AI SDK adapters currently in `core/kortix-master/opencode/opencode.jsonc`.
- The Suna router's `models.dev` live-pricing feed will override hardcoded values at runtime; that's why this doc cites OpenRouter pages as the canonical price source.
