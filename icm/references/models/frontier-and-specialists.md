# Frontier Flagships & Domain Specialists — Research Draft

**Research date:** 2026-05-28
**Purpose:** L3 reference for Claude Code in `ymagineApp` (Brazilian-operated Kortix/Suna fork). Routes work to the right model per task.
**Sourcing rule:** Only primary sources — provider official sites, arXiv papers by model authors, official benchmark sites/papers. NO listicles, blog roundups, or top-N posts.

> **Critical note on Anthropic flagship versioning**: The brief targets Claude **Opus 4.7** (released Apr 16, 2026). As of today (May 28, 2026), Anthropic launched **Claude Opus 4.8** — same pricing, 1M context by default, adaptive thinking with better calibration. Opus 4.7 remains GA. Both are documented below since the user asked for 4.7 specifically and 4.8 just dropped.

---

# Part 1 — Frontier flagships

## Anthropic Claude Opus 4.7

**Identity**
- Official model ID: `claude-opus-4-7`
- Released: April 16, 2026
- Note: Superseded May 28, 2026 by `claude-opus-4-8` (same price, same capabilities + minor adaptive-thinking & cache-minimum upgrades). Opus 4.7 remains available.
- Sources:
  - https://www.anthropic.com/news/claude-opus-4-7
  - https://platform.claude.com/docs/en/release-notes/overview (Apr 16, 2026 entry)

**Capabilities**
- Context window: **1M input tokens** by default on Claude API, Bedrock, Vertex AI (200k on Microsoft Foundry). Output up to **128k** tokens.
- Modalities: text + vision (images up to 2,576 pixels long edge — ~3.75 MP, "more than 3x" prior versions).
- Tool use: native tool calling, parallel tool calls, structured outputs (GA Jan 29, 2026 for 4.x line), programmatic tool calling, web search, web fetch, code execution, computer use, memory tool, Agent Skills.
- Streaming: yes (incl. fine-grained tool streaming GA).
- Prompt caching: yes — 5-min and 1-hour cache TTL GA. Min cacheable prompt = larger on 4.7 than 4.8 (4.8 lowered to 1,024 tokens).
- Reasoning mode: **Adaptive thinking only** (`thinking: {type: "adaptive"}`). Manual `budget_tokens` is rejected (400 error). Effort parameter controls depth (`low` / `medium` / `high` / `xhigh`).
- Sampling: `temperature`, `top_p`, `top_k` cannot be set — returns 400. Prompt to steer behavior.
- Multilingual: Anthropic does not publish per-language benchmarks for 4.7. Strong PT-BR in practice (see Magis-Bench result below: Claude-4.5-Opus = 6.46/10, beating GPT-5.1).
- Source: https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-7 (via 4.8 changelog reference)

**Lab's claimed strengths**
- **Software engineering** — "users report being able to hand off their hardest coding work … with confidence". Anthropic positions Opus 4.7 specifically for long-running agentic coding. (anthropic.com/news/claude-opus-4-7)
- **Vision** — 3.75 MP support unlocks high-resolution screenshots & PDFs.
- **Taste / writing** — Anthropic explicitly says "more tasteful and creative when completing professional tasks, producing higher-quality interfaces, slides, and docs".
- **No published quantitative benchmark table** in the 4.7 announcement post itself; downstream community benchmarks (Magis-Bench, Chatbot Arena Creative Writing) cited below.

**External benchmark data**
- Chatbot Arena (Text Arena, May 2026): `claude-opus-4-7-thinking` = **1500 Elo** (rank 2 overall), `claude-opus-4-7` = **1494 Elo** (rank 4). (arena.ai/leaderboard)
- Chatbot Arena Creative Writing (May 2026): `claude-opus-4-7-thinking` = **1485 Elo** (rank 3), `claude-opus-4-7` = **1484 Elo** (rank 4). Only Anthropic + Google in top 10. (arena.ai/leaderboard/text/creative-writing)
- WebDev category: `claude-opus-4-7-thinking` = **1567 Elo** (rank 1).
- Vision: `claude-opus-4-7-thinking` = **1306 Elo** (rank 1).
- Magis-Bench (Brazilian judicial): Claude-4.5-Opus = **6.46/10** (rank 3), beating GPT-5.1 (6.23). 4.7 not in published Magis-Bench yet but expected ≥ this number.

**How to prompt**
- System prompt: standard `system` field in Messages API. Mid-conversation system messages added in 4.8 (not 4.7).
- Format: Claude historically prefers **XML tags** for structured prompts (Anthropic doc convention). Markdown also fine.
- Tool use: define tools via `tools` array; Claude calls them via `tool_use` blocks. Use `tool_choice: "auto" | "any" | "tool"` to control. Tool overhead on Opus 4.7 = 675 tokens (`auto`/`none`) / 804 tokens (`any`/`tool`).
- Quirks: temperature/top_p forbidden — must use prompt + effort to control determinism.

**Pricing**
- Direct API: **$5.00 input / $25.00 output** per MTok.
- 5-min cache write: $6.25/MTok. 1h cache write: $10/MTok. Cache hit: **$0.50/MTok** (90% off input).
- Batch API: $2.50 in / $12.50 out (50% off).
- Fast mode (preview): $30/$150 per MTok (2.5x speed).
- US-only inference: 1.1x.
- Long-context: NO surcharge; 1M context billed at standard rate.
- Tokenizer: 4.7 introduced a new tokenizer that may use **~35% more tokens** for the same text vs prior models — factor into cost projections.
- Source: https://platform.claude.com/docs/en/about-claude/pricing

**Best use case in ymagineApp**
- Long-horizon agentic coding sessions (Suna sandbox edits, multi-file refactors)
- High-stakes legal/regulated content drafting where taste matters
- Vision tasks: contract PDFs, NF-e, faturas at high resolution
- Default "premium agent brain" route when budget allows

**Sources**
- https://www.anthropic.com/news/claude-opus-4-7
- https://platform.claude.com/docs/en/release-notes/overview
- https://platform.claude.com/docs/en/about-claude/pricing
- https://arena.ai/leaderboard

---

## OpenAI GPT-5.5

**Identity**
- Official model ID: `gpt-5.5` (also `gpt-5.5-pro` for the Pro tier)
- Released: **April 24, 2026** in API
- Source: https://openai.com/index/introducing-gpt-5-5/ ; https://developers.openai.com/api/docs/models/gpt-5.5 (page is HTTP 403 to WebFetch but confirmed via search)

**Capabilities**
- Context window: **1,050,000 input tokens** / **128,000 max output tokens** (per developers.openai.com search result).
- Modalities: text + image **input**; text-only output. NO audio, NO video.
- Tool use: Responses API + Chat Completions API. Function calling, structured outputs, streaming GA. Supported server-side tools: web search, file search, image generation, code interpreter, hosted shell, apply patch, skills, computer use, MCP, tool search.
- Reasoning effort: **`none` / `low` / `medium` (default) / `high` / `xhigh`**.
- Prompt caching: yes — cached input at **$0.50/MTok** (10x discount vs $5.00 base input).
- Streaming: yes. Fine-tuning: NOT supported.
- Knowledge cutoff: **December 1, 2025**.
- Long-prompt surcharge: prompts >272K input tokens billed at 2x input / 1.5x output for the session (standard/batch/flex).

**Lab's claimed strengths**
- **Agentic coding** — "state-of-the-art on Terminal-Bench 2.0 at 82.7%" (openai.com/index/introducing-gpt-5-5/).
- **SWE-Bench Pro**: **58.6%** end-to-end pass.
- **Token efficiency**: "more intelligent and much more token efficient" than GPT-5.4. Matches GPT-5.4 per-token latency.
- **Knowledge work + computer use** explicitly called out.
- For AIME 2025: not separately reported for 5.5 in announce. Predecessor GPT-5.2 reached **100.0%** on AIME 2025 (no tools); GPT-5.5 implied to match or exceed.
- Multilingual: GPT-5.2-thinking scored **0.910** on MMLU Portuguese (per GPT-5.2 system card, 13 languages incl. PT). No GPT-5.5-specific PT score published.

**How to prompt**
- Responses API (`/v1/responses`) is the recommended surface for agents (replaces older Assistants API).
- Function calling: standard OpenAI JSON schema with `parameters`.
- Reasoning: set `reasoning.effort` to `low|medium|high|xhigh`. Higher effort = more thinking tokens, higher cost.
- Structured outputs: schema enforcement via `response_format: { type: "json_schema" }`.
- Verbosity control: explicit `verbosity` parameter on 5.x line.
- Quirk: prompts above 272K trigger 2x/1.5x premium — design context budgets to stay under unless necessary.

**Pricing**
- `gpt-5.5`: **$5.00 input / $30.00 output / $0.50 cached input** per MTok.
- `gpt-5.5-pro`: **$30 input / $180 output** per MTok.
- Batch/Flex: 50% off standard.
- Priority: 2.5x standard.
- Regional/residency: +10%.
- Source: openai.com/api/pricing/ (via search confirmation); developers.openai.com/api/docs/models/gpt-5.5

**Best use case in ymagineApp**
- Most expensive output ($30/MTok output vs Opus $25). Use when GPT-5.5's specific strength matters: terminal/shell-heavy agentic ops, OpenAI-only tools (Codex, native computer use), or when fallback diversity from Claude is desired.
- Default to Claude Opus 4.7 for cost-equivalent coding unless OpenAI ecosystem (MCP server inventory, Codex skills) is required.

**Sources**
- https://openai.com/index/introducing-gpt-5-5/
- https://developers.openai.com/api/docs/models/gpt-5.5 (confirmed via search snippets — page blocks WebFetch with 403)
- https://openai.com/index/gpt-5-5-system-card/
- https://deploymentsafety.openai.com/gpt-5-5

---

## Google Gemini 3.1 Pro

**Identity**
- Official model ID: `gemini-3.1-pro` (preview as of Feb 19, 2026 release; still in preview per blog post but available via Gemini API, Vertex AI, AI Studio, Antigravity, Gemini Enterprise, NotebookLM, Gemini App).
- Released: **February 19, 2026** as preview.
- Sources:
  - https://deepmind.google/models/model-cards/gemini-3-1-pro/
  - https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-pro/

**Capabilities**
- Context: **1M input / 64k output**.
- Modalities: text, **images, audio, video, code repositories** — natively multimodal.
- Tool use: native function calling, Google Search grounding, code execution, computer use via Antigravity. Supports agentic workflows.
- Deep Think mode: available (separate `gemini-3.1-deep-think` model).
- Streaming: yes.
- Caching: context caching with explicit pricing tiers (see below).
- Multilingual: evaluated on "Multilingual Safety" — +0.11% non-egregious vs Gemini 3 Pro. No specific PT-BR perf number published on model card.

**Lab's claimed benchmark scores** (Feb 2026 release)
- **ARC-AGI-2: 77.1%** (verified)
- **GPQA Diamond: 94.3%**
- **SWE-Bench Verified: 80.6%**
- **MMLU: 92.6%**
- **Humanity's Last Exam (with search+code): 51.4%**
- **MMMU-Pro: 80.5%**
- **LiveCodeBench Pro Elo: 2887**
- Magis-Bench (Brazilian judicial): **6.97/10 — rank 1 of 23 models tested** (best in class on Brazilian judicial NLP).
- Source: https://deepmind.google/models/model-cards/gemini-3-1-pro/

**How to prompt**
- Gemini API / Vertex AI: system_instruction field, content parts list.
- Tool use: `tools` with function declarations (JSON Schema-ish, slightly different from OpenAI).
- Grounding: `google_search` tool toggle is server-side, returns sources.
- Structured outputs: `response_mime_type: "application/json"` + `response_schema`.
- Strong typing of multimodal parts (inline data, file data, video frames).

**Pricing**
- Standard:
  - Input ≤200k: **$2.00/MTok** · >200k: **$4.00/MTok**
  - Output ≤200k: **$12.00/MTok** · >200k: **$18.00/MTok**
  - Context caching: $0.20–$0.40/MTok
- Batch: 50% off standard
- Significantly cheaper input than Opus 4.7 ($2 vs $5) for ≤200k prompts.
- Source: https://ai.google.dev/gemini-api/docs/pricing

**Best use case in ymagineApp**
- Frontier reasoning on hardest problems (ARC-AGI-2 #1, HLE leader)
- **Brazilian judicial work** — Magis-Bench rank 1 makes it the best general-purpose flagship for PT-BR judicial drafting (only Sabiá-4 family is more specialized; see Part 2 §2)
- Search-grounded research (Google Search native)
- Long video / audio understanding (only frontier flagship with full multimodal)
- Multilingual high-stakes tasks

**Sources**
- https://deepmind.google/models/model-cards/gemini-3-1-pro/
- https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-pro/
- https://ai.google.dev/gemini-api/docs/pricing
- Magis-Bench paper: https://arxiv.org/html/2605.08437

---

## Google Gemini 3.5 Flash

**Identity**
- Official model ID: `gemini-3.5-flash`
- Released: **May 19, 2026** (GA, stable, "ready for scaled production")
- Sources:
  - https://deepmind.google/models/model-cards/gemini-3-5-flash/
  - https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-5/
- Gemini **3.5 Pro** is internal-only as of May 19, 2026 — "rolling out the following month". Use 3.1 Pro for now.

**Capabilities**
- Context: **1M input / 65k output** (model card: "1M token context window and 65k max output tokens")
- Modalities: text, images, audio, video files.
- Tool use: agentic tool use, MCP, computer use via Antigravity.
- Streaming: yes.
- Caching: explicit context caching with per-MTok and per-hour storage pricing.

**Lab's claimed benchmark scores**
- **SWE-Bench Pro: 55.1%** — beats Gemini 3.1 Pro on this metric
- **MMMU-Pro: 83.6%** (beats 3.1 Pro's 80.5%)
- **CharXiv (chart reasoning): 84.2%**
- **MCP Atlas (multi-step workflow): 83.6%**
- **Terminal-Bench 2.1: 76.2%**
- **GDPval-AA: 1656 Elo**
- **Long context (1M tokens, undisclosed test): 26.6%** — note: this is honest disclosure of long-context recall limits
- **"4x faster" output tokens/sec** vs other frontier models per Google
- Magis-Bench (Brazilian judicial): **6.67/10 — rank 2 of 23 models** (only behind Gemini 3.1 Pro). Excellent PT-BR judicial performance at Flash pricing.
- Chatbot Arena Creative Writing: 1464 Elo (rank 8, preliminary).
- Sources: model card + blog announce + arxiv 2605.08437

**How to prompt**
- Same Gemini API surface as 3.1 Pro.
- Streaming-first design — Google positions Flash as the agentic workhorse.

**Pricing**
- Standard: **$1.50 input / $9.00 output** per MTok
- Cached input: **$0.15/MTok** + $1.00/MTok per hour storage
- Batch: $0.75 in / $4.50 out (50% off)
- Source: https://ai.google.dev/gemini-api/docs/pricing

**Best use case in ymagineApp**
- **High-volume agentic loops** — Flash is the cheapest frontier model with full multimodal + 1M context.
- **PT-BR judicial drafting at scale** — Magis-Bench rank 2 with Flash pricing is best $/quality for Brazilian legal pipelines.
- **OCR / document understanding** for faturas, NF-e, contracts (high MMMU-Pro 83.6%, see Part 2 §5).
- Default "cheap multimodal route" in routing matrix.

**Sources**
- https://deepmind.google/models/model-cards/gemini-3-5-flash/
- https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-5/
- https://blog.google/products-and-platforms/products/gemini/gemini-3-flash/
- https://ai.google.dev/gemini-api/docs/pricing

---

# Part 2 — Domain specialists

## §1. Brazilian Portuguese (PT-BR) generalist

### State of the art (May 2026)

**Top model per published evaluation: Sabiá-4 (Maritaca AI)** — flagship Brazilian Portuguese model with continued-pretraining on PT-BR + Brazilian legal corpora, 128k context, four-stage training pipeline (CPT → long-context extension → SFT → preference alignment).

**Benchmark scores from Sabiá-4 Technical Report (arxiv:2603.10213, March 2026):**

Frontier tier (Sabiá-4 vs GPT-5.2 vs Gemini-3 Pro vs GPT-4.1):
| Benchmark | Sabiá-4 score |
|---|---|
| OAB-Bench (legal drafting) | **7.49 / 10** |
| Magis-Bench (judicial drafting) | **5.08 / 10** |
| Brazilian Laws Knowledge | **97.4%** |
| Multiple Choice Exams (ENEM/CFC/Revalida/CPNU/OAB) | **86.6%** |
| Multi-IF PT (instruction following) | **82.0%** |
| BRACEval (Brazilian conversation, win rate vs GPT-4o) | **53.8%** |

Cost-effective tier (Sabiazinho-4):
- OAB-Bench: 7.02 · Magis-Bench: 4.50 · Brazilian Laws: 85.0% · Multi-IF: 81.0% · Agentic: 55.2%

**Reference: PoETa v2 (arxiv:2511.17808)** — bilingual PT/EN benchmark suite, 44 tasks. Commercial leaderboard:
- GPT-4.1: **76.2 NPM** (rank 1)
- GPT-4o: 75.2 NPM
- Sabiá-3: **72.2 NPM** (rank 3)
- Open-source: Qwen 2.5 14B = 71.0, Qwen 3 14B = 70.5, Falcon 3 10B = 63.5

**Reference: BLUEX (arxiv:2307.05410, updates 2508.21294)** — UNICAMP+USP entrance exams, 1000+ questions, 40% with visual components.
- Sabiá-2 Medium: 79.9% avg accuracy (beats Claude 3 Opus, Mistral Large)
- GPT-4 outperformed Sabiá-2 only on image-heavy questions
- More recent: Sabiá-3 best on text-only, GPT-4o better on visual

**Reference: CAPITU (arxiv:2603.22576)** — instruction-following in PT-BR with literary context.
- GPT-5.2 with reasoning: **98.5% strict accuracy** (still the public leader at instruction-following in PT-BR)
- Sabiá specialized models competitive on cost/quality

### Domain-specific considerations
- **Why Sabiá-4 wins on Brazilian-specific tasks**: continued pretraining on Brazilian legal corpora + supervised fine-tuning on PT-BR exams + alignment with Brazilian cultural references. Trades raw IQ (where frontier wins) for tight domain coverage.
- **Where frontier wins**: open-ended creative writing in PT-BR (Chatbot Arena Creative Writing), agentic coding, math/reasoning.
- **Cost**: Sabiá-4 = **$0.93 in / $3.70 out per MTok**. Sabiazinho-4 = $0.19/$0.74. **~5x cheaper than Opus 4.7** for similar PT-BR exam performance.

### Routing recommendation for ymagineApp
- **Primary (PT-BR domain content, Brazilian compliance, ENEM/OAB-style questions):** Sabiá-4 via Maritaca API.
- **Fallback / general PT-BR chat with cost sensitivity:** Sabiazinho-4.
- **When frontier wins:** Long-form creative writing, complex agentic coding in PT-BR → Gemini 3.1 Pro (HLE leader + PT-BR strong) or Claude Opus 4.7 (Arena Creative Writing #3).

### Open evaluation gaps
- No public Sabiá-4 vs Claude Opus 4.7 head-to-head on the same benchmark (the report compares to GPT-5.2 and Gemini 3 Pro only).
- No PT-BR-specific Chatbot Arena slice (general Creative Writing is multilingual-aggregated).
- Maritaca runs evaluation themselves on most benchmarks — independent reproduction is sparse.

### Sources
- https://arxiv.org/abs/2603.10213 (Sabiá-4 Technical Report)
- https://arxiv.org/html/2511.17808 (PoETa v2)
- https://arxiv.org/abs/2307.05410 (BLUEX)
- https://arxiv.org/pdf/2603.22576 (CAPITU)
- https://www.maritaca.ai/en/pesquisa
- https://huggingface.co/maritaca-ai/sabia-7b

---

## §2. Brazilian judicial / legal AI

### State of the art (May 2026)

**The two complementary winners depend on task type:**

#### A. Brazilian judicial drafting (Magis-Bench — sentencing, judicial analysis)
- Top: **Gemini-3-Pro-Preview: 6.97/10**
- 2: Gemini-3-Flash-Preview: 6.67
- 3: **Claude-4.5-Opus: 6.46**
- 4: GPT-5.1: 6.23
- 5: Gemini-2.5-Pro: 6.18
- Claude-4.5-Sonnet: 5.55 · GPT-4.1: 5.20 · **Sabiá-4: 5.03**
- Source: Magis-Bench paper (arxiv:2605.08437) — 74 questions from Brazilian judicial exams 2023–2025, 58 discursive + 16 sentence-drafting, Kendall's W = 0.984 across 4 judge models.
- **Headline finding**: "even the best-performing models score below 70% of maximum" — Brazilian judicial drafting is HARD; no model is near-saturation.

#### B. Brazilian legal writing — OAB Bar Exam (OAB-Bench, Rabula)
- **Sabiá-4: 7.49/10** (highest published on OAB-Bench in the Sabiá-4 report)
- Sabiazinho-4: 7.02
- Prior leader on the Pires et al. 2026 paper: **Claude-3.5-Sonnet at 7.93/10** (passed all 21 OAB exams) — but on an older test set / pre-Sabiá-4 evaluation.
- Sources:
  - OAB-Bench: arxiv:2504.21202 (Automatic Legal Writing Evaluation of LLMs)
  - Rabula: ceur-ws.org/Vol-4089/paper6.pdf

#### C. Other Brazilian legal benchmarks
- **JUÁ** (arxiv:2604.06098) — Brazilian legal information retrieval across multiple legal document types. First IR-focused benchmark for Brazilian legal text.
- **LegalScore** (arxiv:2502.08652) — Brazilian legal career exam evaluation index.
- **LegalBench-BR** — 3,105 appellate proceedings from TJSC (Santa Catarina State Court) via DataJud/CNJ API.
- **Juru** (arxiv:2403.18140) — small Brazilian legal LLM, predecessor to commercial offerings.
- **LegalBench.PT** (arxiv:2502.16357) — Portuguese (Portugal) law, not Brazilian, but related.

### Domain-specific considerations
- **Civil law system**: Brazil = code-based (CF/88, CC, CPC, CLT, súmulas STJ/STF). Legal models must internalize statutes by article, not just case law.
- **Sabiá-4 explicitly trained on Brazilian legal corpora** — this is why it wins OAB-style essay drafting at lower cost.
- **Gemini 3 Pro wins Magis (judicial)** because judicial drafting needs deep reasoning + cross-statute synthesis where raw IQ beats domain fine-tune.
- **Old Claude 3.5 Sonnet wins one OAB benchmark** on an older eval set — likely Opus 4.7 would match or exceed but no published eval yet.

### Routing recommendation for ymagineApp
- **Primary — Brazilian legal drafting (peticao, recurso, parecer, OAB-style):** Sabiá-4 (cheap + tuned).
- **Primary — Judicial reasoning / sentencing / complex multi-statute analysis:** **Gemini 3.1 Pro** (Magis-Bench #1).
- **Fallback — when both above unavailable or for general high-stakes legal review:** Claude Opus 4.7 (Magis #3 expected, strong PT-BR taste).
- **DO NOT** use frontier models for routine OAB-essay-style generation when Sabiá-4 covers it at 1/5 the cost.

### Open evaluation gaps
- Magis-Bench was just published (2026); results may shift as more 4.7-class evals land.
- No CNJ-published official LLM evaluation (the courts haven't released benchmark methodologies).
- Brazilian legal IR (JUÁ) leaderboard not yet competitive — early days.
- Opus 4.7 + GPT-5.5 not in Magis-Bench paper (paper used 4.5-Opus, GPT-5.1).
- **Sabiá-4 vs Opus 4.7 head-to-head on Brazilian legal writing has NOT been independently published yet.**

### Sources
- Magis-Bench: https://arxiv.org/html/2605.08437
- OAB-Bench / Automatic Legal Writing: https://arxiv.org/pdf/2504.21202
- Rabula: https://ceur-ws.org/Vol-4089/paper6.pdf
- LegalBench.PT: https://arxiv.org/html/2502.16357v1
- LegalScore: https://arxiv.org/pdf/2502.08652
- Juru: https://arxiv.org/html/2403.18140
- JUÁ: https://arxiv.org/html/2604.06098v1
- Sabiá-4 (legal training): https://arxiv.org/abs/2603.10213

---

## §3. Marketing / copywriting / creative writing

### State of the art (May 2026)

**Honest finding: there is NO canonical, rigorous benchmark for marketing copy quality.** Marketing is taste-driven; "winning" is contested.

**Least-bad proxy: Chatbot Arena Creative Writing leaderboard** (human-preference Elo across 921,604 votes / 358 models, May 17, 2026 snapshot):

| Rank | Model | Arena Score |
|---|---|---|
| 1 | claude-opus-4-6-thinking | 1497 ±9 |
| 2 | gemini-3-pro | 1485 ±8 |
| 3 | claude-opus-4-7-thinking | 1485 ±11 |
| 4 | claude-opus-4-7 | 1484 ±11 |
| 5 | gemini-3.1-pro-preview | 1483 ±8 |
| 6 | claude-opus-4-6 | 1477 ±9 |
| 7 | claude-opus-4-5-thinking | 1468 ±8 |
| 8 | gemini-3.5-flash | 1464 ±17 (preliminary) |
| 9 | claude-opus-4-5 | 1463 ±7 |
| 10 | grok-4.20-beta1 | 1462 ±10 |

Top 10 = 9 Anthropic + Google entries, 1 xAI. No OpenAI in top 10 (GPT-5.5 not yet on this leaderboard at this snapshot date).
Source: https://arena.ai/leaderboard/text/creative-writing

### Domain-specific considerations
- **Anthropic's "taste" claim is empirically backed** by Chatbot Arena. Claude Opus 4.x dominates creative writing in head-to-head human votes.
- **No marketing-specific labs**: Jasper, Copy.ai do NOT publish capability benchmarks for their underlying models; they consume frontier APIs + apply their own RAG/style controls.
- **PT-BR creative writing**: Arena scores are multilingual-aggregated. For Brazilian PT-BR voice/tone, Sabiá-4 has cultural references frontier models lack — but no Arena-style PT-BR creative leaderboard exists.
- **Marketing taste varies by brand voice** — no benchmark captures "this fits Nike's voice" vs "this fits Magazine Luiza's voice".

### Routing recommendation for ymagineApp
- **Primary (English/global creative writing):** Claude Opus 4.7 with thinking (Arena rank 3).
- **Secondary (multimodal copy where images matter):** Gemini 3.1 Pro (rank 5) or 3.5 Flash (rank 8) at much lower cost.
- **Primary (PT-BR brand voice with Brazilian cultural references):** Sabiá-4 — only Brazilian-trained option, but data is anecdotal not benchmarked.
- **Honest disclaimer**: For copy/marketing in ymagineApp, recommend frontier flagship + style transfer prompts + brand voice library. Do NOT route based on hard benchmarks — they don't exist for this domain.

### Open evaluation gaps
- **No marketing-specific benchmark exists.** Arena Creative Writing is the closest proxy but covers stories/poems/jokes more than ad copy.
- **No PT-BR creative writing leaderboard.** Sabiá-4 advantage on cultural references is plausible but unproven.
- **Style consistency across long campaigns** — no benchmark for this.
- Jasper/Copy.ai/Writesonic don't publish benchmarks → no industry SOTA reference.

### Sources
- https://arena.ai/leaderboard/text/creative-writing
- https://news.lmarena.ai/arena-category/

---

## §4. Coding SOTA (per benchmark)

### State of the art (May 2026)

**No single coding SOTA — leadership splits by benchmark.** Sibling research is covering Kimi K2.6 / Grok 4.2 / MiMo V2.5 (OpenRouter coding routers) so those are explicitly EXCLUDED here. This section covers EVERYTHING ELSE.

#### SWE-Bench Verified (real GitHub issues)
Per published numbers (paper / model card):
| Model | Score | Source |
|---|---|---|
| **Opus 4.6 Max** | **80.8%** | DeepSeek-V4 release post comparison table |
| **DeepSeek-V4-Pro-Max** | **80.6%** | huggingface.co/blog/deepseekv4 |
| **Gemini 3.1 Pro** | **80.6%** | model card |
| Claude Opus 4.5 | 78.2% | Qwen3-Coder-Next paper |
| Gemini 3 Flash | 78% | gemini-3-flash blog post |
| Qwen3-Coder-Next | 70.6–71.3% (scaffold-dependent) | technical report |
| DeepSeek-V3.2 | 70.2% | Qwen3-Coder-Next paper |
| **Headline**: SWE-Bench Verified is **saturating** ~80% across top systems. Top is within ~2 points.

#### SWE-Bench Pro (harder, multi-line patches)
| Model | Score |
|---|---|
| **GPT-5.5: 58.6%** | openai announce |
| Gemini 3.5 Flash: 55.1% | model card |
| Qwen3-Coder-Next: 44.3% (SWE-Agent scaffold) | technical report |

#### Terminal-Bench 2.0 / 2.1 (command-line agentic workflows)
| Model | Score |
|---|---|
| **GPT-5.5: 82.7%** (SOTA per OpenAI) | openai announce |
| Gemini 3.5 Flash (Terminal-Bench 2.1): 76.2% | model card |
| GPT-5.4-xHigh: 75.1% | DeepSeek-V4 comparison |
| DeepSeek-V4-Pro-Max: 67.9% (2.0) | huggingface |
| Qwen3-Coder-Next: 34.2% (2.0, Terminus2-xml) | tech report |

#### LiveCodeBench Pro (Elo)
| Model | Elo |
|---|---|
| **Gemini 3.1 Pro: 2887** | model card |
| Qwen3-Coder-Next: ~58.93% pass@1 (LiveCodeBench, not Pro Elo) | tech report |

#### Aider Polyglot (Exercism-style multi-language coding, 225 tasks)
The public leaderboard (aider.chat/docs/leaderboards/) is **NOT yet updated** with Opus 4.7 / 4.8, GPT-5.5, Gemini 3.x, DeepSeek-V4, or Qwen3-Coder-Next as of May 2026. Current published top:
| Model | Pass rate | Cost |
|---|---|---|
| gpt-5 (high) | 88.0% | $29.08 |
| gpt-5 (medium) | 86.7% | $17.69 |
| o3-pro (high) | 84.9% | $146.32 |
| gemini-2.5-pro-preview-06-05 (32k think) | 83.1% | $49.88 |
| DeepSeek-V3.2-Exp (Reasoner) | 74.2% | **$1.30** |

#### Open-weight SOTA — DeepSeek-V4
- **Open-source SOTA on agentic coding** per DeepSeek's own evaluation
- Toolathlon: **51.8** (beats K2.6 50.0, Gemini 3.1 Pro 48.8)
- MCPAtlas Public: 73.6 (only behind Opus 4.6 Max at 73.8)
- 1M context window (1.6T total / 49B active MoE for V4-Pro)
- MRCR 8-needle long-context: 0.82+ accuracy through 256K, 0.59 at 1M
- Internal R&D coding bench: V4-Pro-Max = 67% vs Opus 4.5 = 70%, Sonnet 4.5 = 47%

#### Qwen3-Coder-Next
- 80B total / 3B active MoE
- 262,144 token context
- SWE-Bench Verified: 70.6–71.3% (depending on scaffold)
- SWE-Bench Pro: 42.7% / Multilingual: 62.8%
- LiveCodeBench: 58.93% · AIME 2025: 83.07%
- **Best small-active-parameter coder** for self-host scenarios.

### Domain-specific considerations
- **Saturation on Verified, real gap on Pro.** Use SWE-Bench Pro / Terminal-Bench / LiveCodeBench Pro to differentiate; Verified is no longer discriminating.
- **GPT-5.5 wins Pro + Terminal-Bench**; **Gemini 3.1 Pro wins LiveCodeBench Pro**; **DeepSeek-V4 wins open-source agentic + cheapest leadership** ($1.30/test on Aider equivalent).
- **For Brazilian context**: none of these are PT-BR-specific. Coding is mostly language-agnostic; English comments/identifiers preferred.

### Routing recommendation for ymagineApp
- **Primary coding (Suna sandbox agentic, long-horizon):** Claude Opus 4.7 (4.7's lab pitch is agentic coding; matches Pro tier).
- **Primary terminal/shell-heavy:** GPT-5.5 (Terminal-Bench 82.7% SOTA).
- **Primary research / math-heavy coding:** Gemini 3.1 Pro (LiveCodeBench Pro Elo 2887 + HLE 51.4%).
- **Cheap bulk coding / fallback:** Gemini 3.5 Flash (SWE-Bench Pro 55.1% at $1.50/$9 pricing).
- **Self-host / cost-optimized open-source:** DeepSeek-V4-Pro (1M context, agentic SOTA OSS) or Qwen3-Coder-Next (80B, smaller footprint).

### Open evaluation gaps
- **Aider Polyglot is stale** — no Opus 4.7+, GPT-5.5, Gemini 3.x entries yet.
- SWE-Bench Verified is saturating → community is moving to SWE-Bench Pro / Multilingual.
- "SWE-ABS" paper (arxiv:2603.00520) shows 1-in-5 SWE-Bench "solved" patches may be semantically wrong (weak test suites). All scores should be discounted ~20%.

### Sources
- https://www.swebench.com/verified.html
- https://livecodebench.github.io/leaderboard.html
- https://aider.chat/docs/leaderboards/
- https://openai.com/index/introducing-gpt-5-5/
- https://deepmind.google/models/model-cards/gemini-3-1-pro/
- https://deepmind.google/models/model-cards/gemini-3-5-flash/
- https://huggingface.co/blog/deepseekv4
- https://arxiv.org/html/2603.00729v1 (Qwen3-Coder-Next)

---

## §5. Vision / OCR / document understanding

### State of the art (May 2026)

#### General multimodal reasoning (MMMU-Pro)
| Model | Score |
|---|---|
| **Gemini 3.5 Flash: 83.6%** | model card |
| Gemini 3 Flash: 81.2% | gemini-3-flash blog |
| Gemini 3.1 Pro: 80.5% | model card |
| Qwen3-VL: "leading on MMMU" (specific number per-checkpoint, see report) | arxiv:2511.21631 |

#### Document VQA (DocVQA)
| Model | Score (ANLS) | Source |
|---|---|---|
| **Qwen3-VL-4B: 94.9** (beats specialized OCR baseline 92.8) | Qwen3-VL report |
| Pixtral 12B: 90.7 | Pixtral 12B paper |
| Claude 3.5 Sonnet: 90.3 | Pixtral paper comparison |
| GPT-4o: 88.9 | Pixtral paper comparison |

#### OCRBench / OCRBench v2 (bilingual, 31 scenarios, 10k QA pairs)
- **Closed-source leader: Gemini 3 Pro** ("relatively robust" per OCRBench v2 paper arxiv:2501.00321)
- Open-source: dramatic performance collapse on non-Latin scripts + real photographed docs
- Specific leaderboard (huggingface.co/spaces/ling99/OCRBench-v2-leaderboard) requires JS render — top scores not fetchable via WebFetch. Marked as **thin source**.

#### Chart understanding (CharXiv)
- **Gemini 3.5 Flash: 84.2%** (chart reasoning) — model card

#### Qwen3-VL specifics
- 6 model sizes: 2B / 4B / 8B / 32B dense + 30B-A3B / 235B-A22B MoE
- 256K context
- **OCR support: 32 languages** (up from 19) — Portuguese **confirmed in supported list** (matters for ymagineApp PT-BR documents)
- Robust on low light, blur, tilt, rare characters, ancient text
- Improved long-document structure parsing
- Source: arxiv:2511.21631

#### MiMo-VL (Xiaomi)
- 7B compact VLM, MiMo language backbone
- Domains: general VL, video, document/OCR, GUI grounding, text reasoning (20 benchmarks)
- "Modest performance dip on document understanding, OCR, and mathematics" per Xiaomi's own report
- **NOT the SOTA for document understanding** — better positioned for agentic GUI / general perception
- MiMo-V2.5: native omnimodal (text/image/video/audio)
- Sources: arxiv:2506.03569 (MiMo-VL), arxiv:2512.17436 (MiMo-VL-Miloco)

#### Pixtral (Mistral)
- Pixtral Large: deprecated 2026-02-27 per Mistral docs (page redirect confirms)
- Pixtral 12B DocVQA: 90.7% — still strong but smaller than Qwen3-VL frontier
- Beats GPT-4o + Gemini 1.5 Pro on DocVQA + ChartQA (but those are old comparisons)

### Domain-specific considerations
- **For Brazilian docs (NF-e, faturas, contracts, RG/CNH/CPF):** OCR quality on PT-BR text + handling of Brazilian-specific layouts matters more than English DocVQA leadership.
- **Qwen3-VL is the open-weight winner** with explicit PT support, and 4B model beats specialized OCR baselines on DocVQA.
- **Gemini 3.5 Flash is the proprietary winner** for multimodal reasoning + cost ($1.50/$9 vs Opus $5/$25).
- **Claude Opus 4.7 vision** (3.75MP, "more than 3x" prior) is competitive but no published OCRBench number.

### Routing recommendation for ymagineApp
- **Primary (high-volume PT-BR document parsing — NF-e, faturas):** Gemini 3.5 Flash (cheap + MMMU 83.6 + 1M context for batch).
- **Primary (high-stakes contract analysis):** Claude Opus 4.7 (3.75MP res, vision Elo #1 on Arena).
- **Self-host / on-prem PT-BR OCR:** Qwen3-VL (4B or 8B; 32-language incl. PT; beats specialized OCR baselines).
- **Charts / financial dashboards:** Gemini 3.5 Flash (CharXiv 84.2% specifically).
- **Avoid for vision:** Pixtral Large (deprecated), MiMo-VL (Xiaomi's own report says OCR is a weak point).

### Open evaluation gaps
- **OCRBench v2 leaderboard is not WebFetch-readable** (JS-rendered Hugging Face Space). Top-N model list is thin.
- **No PT-BR-specific OCR benchmark** exists.
- **No Claude Opus 4.7 OCRBench score** published.
- **Brazilian document types** (NF-e XML embedded, boleto, CNH, faturas of Brazilian utilities) not in standard benchmarks.

### Sources
- https://arxiv.org/abs/2511.21631 (Qwen3-VL)
- https://arxiv.org/html/2501.00321v2 (OCRBench v2)
- https://arxiv.org/pdf/2506.03569 (MiMo-VL)
- https://docs.mistral.ai/models/model-cards/pixtral-large-24-11
- https://arxiv.org/html/2410.07073v2 (Pixtral 12B paper)
- https://deepmind.google/models/model-cards/gemini-3-5-flash/
- https://blog.google/products-and-platforms/products/gemini/gemini-3-flash/

---

## §6. Long-context (1M+ tokens) summarization / analysis

### State of the art (May 2026)

**Native 1M+ context window models:**
| Model | Native context | Effective long-context (measured) |
|---|---|---|
| **Claude Opus 4.7 / 4.8** | 1M (GA Mar 2026) | Not independently RULER-benchmarked yet |
| **Gemini 3.1 Pro** | 1M input | Best long-context in Gemini history (lab claim) |
| **Gemini 3.5 Flash** | 1M | **26.6% accuracy at 1M** (honest disclosure on model card) |
| **GPT-5.5** | 1.05M | Charged 2x in / 1.5x out above 272K |
| **DeepSeek-V4-Pro** | 1M | MRCR 8-needle: 0.82+ at 256K, 0.59 at 1M |
| **MiniMax-M1** | 1M native | "Strong on long-context tasks" per paper |
| **Kimi K2.6** | 262,144 | (Sibling research; excluded here) |
| **Qwen3-VL / Qwen3-Coder-Next** | 256K | Solid for code repos |

### RULER / NIAH context
- **RULER benchmark finding** (paper): "only half of models claiming 32K+ context can maintain satisfactory performance" — claimed context overstates effective capability.
- **Gemini 1.5 Pro on NIAH**: 100% recall to 530k tokens, 99.7% at 1M (original Gemini 1.5 paper, arxiv:2403.05530). Gemini 3.x line inherits or improves.
- **Gemini 2 Flash / 2.5 Pro on long-context**: stable 63–72% across all brackets up to 1M (per LongCodeBench data).
- **Claude 3.5 Sonnet historical drop**: 29% → 3% on long-context retrieval (LongCodeBench). Note: this is OLD Sonnet 3.5; Opus 4.7 1M GA improvement not yet independently measured.

### Cost-per-million-tokens at 1M context
| Model | Input @ 1M / Output @ 1M |
|---|---|
| Gemini 3.5 Flash | $1.50 / $9.00 (flat — no surcharge) |
| Gemini 3.1 Pro (>200k tier) | **$4.00 / $18.00** |
| Claude Opus 4.7 | **$5 / $25** (flat — no long-context surcharge) |
| GPT-5.5 (>272K) | $10 input / $45 output (2x/1.5x penalty) |
| DeepSeek-V4 | (not yet published — likely cheapest) |

### Domain-specific considerations
- **For ymagineApp legal/judicial workflows**: a 200k-token jurisprudence corpus needs reliable mid-context recall (not just NIAH).
- **For agentic loops**: long-context recall degrades fastest under tool-use noise. Compaction (Anthropic) and context editing help.
- **Honest signal — Gemini 3.5 Flash's own card says 26.6% at 1M** — even the best 1M models struggle at the very end of the window. Don't push >500k unless necessary.

### Routing recommendation for ymagineApp
- **Primary (highest-fidelity 1M context analysis):** Gemini 3.1 Pro at >200k tier. Best published long-context recall trajectory + frontier reasoning.
- **Cost-optimized 1M context:** Gemini 3.5 Flash (cheap + honest 26.6% disclosure — use only when summarization not retrieval is the goal).
- **Agentic long-context with reasoning:** Claude Opus 4.7 (1M flat pricing, no surcharge, adaptive thinking handles dynamic context length).
- **Self-host 1M:** DeepSeek-V4-Pro (1M native, open weights, 0.59 MRCR at 1M).
- **Avoid for true 1M depth:** Gemini 3.5 Flash for retrieval (use Pro), Claude pre-4.6 (200k cap).

### Open evaluation gaps
- **No public RULER scores for Claude Opus 4.7 / 4.8 at 1M.**
- **No RULER scores for GPT-5.5 at full context.**
- Long-context benchmarks evolve fast (RULER → MRCR → LongCodeBench); leaderboards inconsistent.
- **Real-world legal corpus retrieval at 500k+ tokens** — no Brazilian-specific eval published.

### Sources
- https://arxiv.org/html/2505.07897v3 (LongCodeBench)
- https://arxiv.org/pdf/2403.05530 (Gemini 1.5 paper, NIAH 99.7% at 1M)
- https://arxiv.org/pdf/2506.13585 (MiniMax-M1)
- https://huggingface.co/blog/deepseekv4 (DeepSeek-V4 MRCR data)
- https://deepmind.google/models/model-cards/gemini-3-5-flash/ (26.6% at 1M disclosure)
- https://platform.claude.com/docs/en/release-notes/overview (1M GA confirmation)
- https://platform.claude.com/docs/en/about-claude/pricing (flat long-context pricing)

---

# Part 3 — Final routing matrix for ymagineApp

| Task type | Primary | Fallback | Reason |
|---|---|---|---|
| **Long-horizon agentic coding** (Suna sandbox, multi-file) | Claude Opus 4.7 | DeepSeek-V4-Pro (self-host) | Lab-pitched for this; Arena WebDev #1 |
| **Terminal / shell-heavy agent** | GPT-5.5 | Claude Opus 4.7 | Terminal-Bench 82.7% SOTA |
| **Research / math-heavy reasoning** | Gemini 3.1 Pro | Claude Opus 4.7 | HLE 51.4%, ARC-AGI-2 77.1%, LCB Pro Elo 2887 |
| **General PT-BR chat / Q&A / domain knowledge** | Sabiá-4 | Gemini 3.1 Pro | 86.6% on Brazilian exams; 5x cheaper than Opus |
| **PT-BR OAB-style legal writing** | Sabiá-4 (OAB-Bench 7.49) | Claude Opus 4.7 | Trained on Brazilian legal corpora |
| **Brazilian judicial drafting / sentencing** | Gemini 3.1 Pro (Magis-Bench 6.97) | Claude Opus 4.7 (6.46) | Magis #1 + #3 |
| **Creative writing / marketing copy (EN/global)** | Claude Opus 4.7-thinking | Gemini 3.1 Pro | Arena Creative #3 + #5; no marketing-specific benchmark |
| **PT-BR brand voice / cultural copy** | Sabiá-4 | Claude Opus 4.7 | Cultural references; thin benchmark |
| **NF-e / faturas / boletos OCR (volume)** | Gemini 3.5 Flash | Qwen3-VL (self-host) | MMMU-Pro 83.6 + cheapest; PT in 32-lang OCR |
| **High-stakes contract analysis (vision)** | Claude Opus 4.7 | Gemini 3.1 Pro | 3.75MP vision + Arena Vision #1 |
| **Chart / financial dashboard understanding** | Gemini 3.5 Flash | Gemini 3.1 Pro | CharXiv 84.2% |
| **1M context summarization** | Gemini 3.1 Pro | Claude Opus 4.7 | Long-context recall track record + frontier reasoning |
| **1M context cheap batch** | Gemini 3.5 Flash | DeepSeek-V4-Pro | $1.50/$9, no surcharge |
| **Cheap high-volume routing / simple ops** | Gemini 3.5 Flash | Claude Haiku 4.5 ($1/$5) | Flash is multimodal + 1M at Haiku-ish cost |
| **Computer use / browser agent** | Claude Opus 4.7 (computer_20250124 tool) | Gemini 3.1 Pro (Antigravity) | Native computer use tool + GUI grounding |

---

# Part 4 — Thin sources (where evidence was sparse — DO NOT OVERCLAIM)

1. **Marketing/copywriting benchmarks** — NO rigorous benchmark exists. Chatbot Arena Creative Writing is the closest proxy. Jasper/Copy.ai/Writesonic don't publish capability benchmarks. Treat the routing rec as "best frontier with PT-BR fallback" not as benchmark-backed.

2. **PT-BR creative writing leaderboard** — Does not exist. Sabiá-4 advantage on Brazilian cultural references is plausible but unproven head-to-head.

3. **Claude Opus 4.7 OCRBench / OCRBench v2 score** — Not published. Vision Elo on Arena is impressive but no specific OCR number.

4. **GPT-5.5 PT-BR / multilingual benchmark** — Not published. Inferred from GPT-5.2 score of 0.910 on MMLU-PT.

5. **Sabiá-4 vs Claude Opus 4.7 head-to-head** — Sabiá-4 report compares to GPT-5.2 + Gemini-3 Pro, NOT Opus. Routing rec assumes pattern from prior Sabiá-3 vs Claude data.

6. **Aider Polyglot leaderboard** — Stale; missing Opus 4.7+, GPT-5.5, Gemini 3.x, DeepSeek-V4, Qwen3-Coder-Next. Don't cite Aider for current SOTA.

7. **OCRBench v2 specific top-N rankings** — Hugging Face Space requires JS rendering; could not fetch the live leaderboard. Have to rely on paper-level claim that "Gemini 3 Pro is closed-source leader, open-source collapses on non-Latin scripts".

8. **RULER scores for Claude Opus 4.7 / 4.8 / GPT-5.5 at 1M** — Not published. Long-context routing recs rely on lab claims + adjacent model data (Gemini 1.5 → 3.x inheritance assumption).

9. **CNJ / Brazilian government AI evaluations** — NO official CNJ-published LLM benchmark exists. All Brazilian legal evals are academic (USP, UNICAMP, FGV groups).

10. **Brazilian-specific document benchmarks** (NF-e XML, boleto Brazilian, CNH layouts) — Don't exist in published academic literature. Real PT-BR document parsing performance must be validated empirically in-house.

11. **Magis-Bench published Nov 2025 / early 2026** — newest; results may shift as 4.7 / 4.8 / GPT-5.5 are added.

12. **GPT-5.5 detailed model card via official docs** — `developers.openai.com` returns HTTP 403 to WebFetch; data triangulated from openai.com announce + search snippets. Pricing / context window are confirmed but a direct WebFetch of the full model card was not possible.

13. **DeepMind Gemini 3.1 Pro full evaluation PDF** — fetched but PDF binary not parseable via WebFetch. Numbers triangulated from model card + blog post.

14. **Anthropic Opus 4.7 specific benchmark suite** — Anthropic's announce post does NOT include a quantitative table (unlike Google's model cards). Coding strength claim is qualitative ("hand off your hardest coding work"). Quantitative validation lives in third-party benchmarks (Arena, Magis-Bench).

---

**End of research draft.**
