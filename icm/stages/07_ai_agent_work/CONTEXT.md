# Stage 07 · AI Agent Work (Layer 2)

When the change is to a **runtime AI agent** inside ymagineApp — not Claude Code itself.
Editing system prompts, persona prompts, model routing in `apps/api/src/router/config/models.ts`,
agent definitions in `.opencode/agents/`, RAG tool prompts, or anything that decides how a
Kortix agent BEHAVES.

This is different from Stage 01 because:
- The "build" is the prompt + the model choice — there is no CI gate for prompt quality.
- Verification is **observational** — you need to run the agent and read the output, then iterate.
- The wrong model choice can be invisibly expensive (5x cost difference between Sabiá-4 and Opus for the SAME PT-BR legal task).
- Persona / RAG prompts have known failure modes that depend on the specific model's behavior.

## Inputs

- L3 reference: `../../references/models/coding-routers.md` (Kimi K2.6 — locked sampling, thinking+tools incompatibilities; Grok 4.20 MA — Responses API only, NO custom tools; MiMo V2.5 vs V2.5-Pro split)
- L3 reference: `../../references/models/frontier-and-specialists.md` (Opus 4.7/4.8 / GPT-5.5 / Gemini 3.1 Pro+Flash 3.5 / Sabiá-4 PT-BR / vision SOTA / **routing matrix at the end**)
- L3 reference: `../../references/claude-failure-modes.md` §3 (writing files into the wrong runtime boundary — Suna's incident where a workspace tool import broke EVERY agent's response)
- L3 reference: `../../references/architecture.md` (where agent definitions / OpenCode skills live — `.opencode/tool/` vs `core/kortix-master/opencode/tools/` vs `apps/api`)
- L3 reference: `../../references/decisions.md` D-008 (LLM routing via OpenRouter server-side; BYOK is fragile)
- L4 working: the user request describing the agent change (new persona, new tool, new model routing)

## Process

1. **Pick the right model BEFORE writing the prompt.**
   - PT-BR legal / Brazilian judicial → **Sabiá-4** (Maritaca) primary, Gemini 3.1 Pro fallback. (~5x cheaper than Opus on the same task, with published OAB-Bench / Magis-Bench evidence.)
   - General PT-BR conversation / RAG persona → **Sabiá-4** or Opus 4.7/4.8 (cost vs quality).
   - Heavy coding / long-running agentic work → **Opus 4.7/4.8** or **GPT-5.5** (Terminal-Bench / SWE-Bench Pro leader). Kimi K2.6 if cost-sensitive AND not using thinking+custom-tools (incompatible).
   - Vision / document parsing (faturas, contratos PDF) → **Qwen3-VL** (DocVQA 94.9, PT-supported) or Gemini Flash vision for cost.
   - General creative / marketing copy → **Opus 4.6+ thinking** (Chatbot Arena Creative Writing #1) or Gemini 3.1 Pro.
   - Long-context (>200k) summarization → Gemini 3.1 Pro or Kimi K2.6 (256k native).
   - **DO NOT pick Grok 4.20 multi-agent** for any agent that uses custom tools — it's Responses-API-only and ONLY supports xAI's built-in tools (web_search, x_search, code_execution, collections_search). Rules it out for `consultar_autor` and anything similar.

2. **Match the prompt style to the model.** Different labs respond to different formats:
   - **Anthropic Claude (Opus / Sonnet)** — XML tags work well; "respond as X" persona prompts respect strong system role; supports prompt caching with 1K min on 4.8 (5K min on 4.7).
   - **Kimi K2.6** — temperature/top_p are LOCKED (provider-side; 1.0/1.0 thinking, 0.6/0.95 instant); thinking + tools forces `tool_choice` to auto/none; built-in `$web_search` incompatible with thinking. Don't set sampling params in the request.
   - **MiMo V2.5-Pro** — designed for 1000+ tool calls per session; OpenAI + Anthropic compatible endpoints.
   - **Gemini 3.1 Pro** — strong on Brazilian legal (#1 Magis-Bench), good multimodal grounding.
   - **GPT-5.5** — Terminal-Bench / SWE-Bench Pro leader; uses Pro tier ($30/$180) for hardest tasks only.

3. **Check the boundary**: agent definition file, OpenCode tool, RAG tool — does it run in the workspace runtime, the kortix/computer image, or the api? Imports must resolve in THAT runtime (claude-failure-modes §3).

4. **Update the actual routing config** — `apps/api/src/router/config/models.ts` is currently still on `moonshotai/kimi-k2.5` for the `kortix/kimi` friendly ID. If swapping to K2.6 or a new model, update this file AND verify the OpenCode `opencode.jsonc` still composes correctly.

5. **Ship via Stage 01** for the code change (the prompt / config file edit goes through the same branch → PR → ci-build → deploy flow).

6. **Verify behaviorally**, not with CI:
   - After deploy, talk to the agent in prod (or staging if you have it).
   - Check the EXPECTED behavior (persona, grounding, refusal patterns) and at least one ADVERSARIAL case (jailbreak attempt, off-topic, etc.).
   - Watch Sentry / BetterStack for spikes in tool-call errors or 4xx from the LLM provider — wrong sampling-param config will show up as 400s.

## Outputs

- The edited prompt / agent file / routing config, merged + deployed.
- Notes on observed behavior changes → `../../output/agent-runs/<date>-<agent>.md` (gitignored).
- If you discovered a NEW model behavior worth recording → append to the right model section in `references/models/`.

## Verify

- [ ] Right model picked per the routing matrix (frontier-and-specialists.md final table)
- [ ] Prompt style matches the model's documented preferences (see model card section in the L3 ref)
- [ ] No sampling params sent to providers that lock them (Kimi K2.6, Opus 4.7/4.8)
- [ ] Custom tools NOT routed through Grok 4.20 multi-agent
- [ ] The file you edited runs in the runtime boundary that can resolve its imports (claude-failure-modes §3)
- [ ] Behavioral test in prod: persona is correct, grounding is correct, refusal patterns are sane
- [ ] Cost check: are you using a flagship for a task a specialist would do 5x cheaper? (Sabiá-4 for PT-BR legal is the canonical example.)
- [ ] Sentry / BetterStack clean of new 4xx from LLM provider in first 30 min after deploy
