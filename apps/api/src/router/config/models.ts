import { getModelPricing } from './model-pricing';

// =============================================================================
// Model Registry
// =============================================================================

export interface ModelConfig {
  /** The actual model ID to send to OpenRouter */
  openrouterId: string;
  inputPer1M: number;   // Cost per 1M input tokens (USD)
  outputPer1M: number;  // Cost per 1M output tokens (USD)
  contextWindow: number;
  tier: 'free' | 'paid';
  cacheReadPer1M?: number;   // Cost per 1M cached-read tokens (USD)
  cacheWritePer1M?: number;  // Cost per 1M cache-write tokens (USD)
}

/**
 * Kortix model registry — maps model IDs exposed through the Kortix provider
 * to their OpenRouter equivalents with pricing.
 *
 * Model IDs use the real provider/model format (e.g. "moonshotai/kimi-k2.5")
 * so users see actual model names, not opaque aliases.
 *
 * Any model NOT in this registry is passed through to OpenRouter as-is
 * with live pricing from models.dev (or zero if unknown).
 */
export const MODELS: Record<string, ModelConfig> = {
  'minimax/minimax-m2.7': {
    openrouterId: 'minimax/minimax-m2.7',
    inputPer1M: 0.30,
    outputPer1M: 1.20,
    contextWindow: 204800,
    tier: 'free',
    cacheReadPer1M: 0.06,
  },
  'z-ai/glm-5-turbo': {
    openrouterId: 'z-ai/glm-5-turbo',
    inputPer1M: 1.20,
    outputPer1M: 4.00,
    contextWindow: 202752,
    tier: 'free',
    cacheReadPer1M: 0.24,
  },
  'moonshotai/kimi-k2.5': {
    openrouterId: 'moonshotai/kimi-k2.5',
    inputPer1M: 0.45,
    outputPer1M: 2.20,
    contextWindow: 262144,
    tier: 'free',
    cacheReadPer1M: 0.225,
  },
  'minimax/minimax-m2.5': {
    openrouterId: 'minimax/minimax-m2.5',
    inputPer1M: 0.20,
    outputPer1M: 1.17,
    contextWindow: 196608,
    tier: 'free',
    cacheReadPer1M: 0.10,
  },
};

/**
 * Legacy alias map — model IDs that may still appear in persisted state
 * (DB rows, user preferences, agent definitions) after the kortix-yolo
 * provider was removed (decisions.md D-020). Each entry rewrites a legacy
 * ID to the canonical upstream ID so requests with stale model selectors
 * don't 400 at the provider.
 */
const LEGACY_ALIAS_MAP: Record<string, string> = {
  // kortix/* aliases — used by the (removed) `kortix` opencode provider
  'kortix/minimax-m27': 'minimax/minimax-m2.7',
  'kortix/glm-turbo': 'z-ai/glm-5-turbo',
  'kortix/kimi': 'moonshotai/kimi-k2.5',
  'kortix/minimax': 'minimax/minimax-m2.5',
  // kortix-yolo/* — used by the (removed) `kortix-yolo` opencode provider.
  // Both Fast and Think mapped to Anthropic Sonnet — that's now the canonical
  // path (per opencode.jsonc after the removal).
  'kortix-yolo/fast': 'anthropic/claude-sonnet-4-6',
  'kortix-yolo/think': 'anthropic/claude-sonnet-4-6',
};

/**
 * Default model for Kortix-managed contexts (cron, memory, etc.)
 * that need a sensible default without user input.
 */
export const DEFAULT_MODEL_ID = 'minimax/minimax-m2.7';

// =============================================================================
// Model Resolution
// =============================================================================

/**
 * Resolve a user-provided model ID to a ModelConfig.
 *
 * Priority:
 * 1. models.dev live pricing (always current, refreshed every 24h) — pricing only
 * 2. MODELS registry — provides contextWindow, tier, and cache pricing,
 *    and acts as pricing fallback when models.dev hasn't loaded yet or is unknown
 * 3. Zero pricing (billing skipped) if completely unknown
 */
export function getModel(modelId: string): ModelConfig {
  // Rewrite legacy model IDs (kortix/*, kortix-yolo/*) to their canonical
  // upstream equivalents before any lookup. See LEGACY_ALIAS_MAP + D-020.
  const normalizedId = LEGACY_ALIAS_MAP[modelId] ?? modelId;

  const openrouterId = normalizedId.startsWith('openrouter/')
    ? normalizedId.replace('openrouter/', '')
    : normalizedId;

  const registryEntry = MODELS[normalizedId] ?? MODELS[openrouterId];

  // models.dev is source of truth for pricing — always wins if available
  const livePricing = getModelPricing(normalizedId) ?? getModelPricing(openrouterId);

  if (livePricing) {
    return {
      openrouterId,
      // Merge registry metadata with live pricing
      contextWindow: registryEntry?.contextWindow ?? 128000,
      tier: registryEntry?.tier ?? 'paid',
      cacheReadPer1M: registryEntry?.cacheReadPer1M,
      cacheWritePer1M: registryEntry?.cacheWritePer1M,
      // Pricing always from models.dev
      inputPer1M: livePricing.inputPer1M,
      outputPer1M: livePricing.outputPer1M,
    };
  }

  // models.dev unknown — fall back to hardcoded registry prices
  if (registryEntry) {
    return registryEntry;
  }

  return {
    openrouterId,
    inputPer1M: 0,
    outputPer1M: 0,
    contextWindow: 128000,
    tier: 'paid',
  };
}

/**
 * Resolve a model ID to the OpenRouter model ID.
 * This is the ID that gets sent in the request body to OpenRouter.
 */
export function resolveOpenRouterId(modelId: string): string {
  return getModel(modelId).openrouterId;
}

/**
 * Get all available models for /v1/models endpoint.
 */
export function getAllModels() {
  return Object.entries(MODELS).map(([id, cfg]) => ({
    id,
    object: 'model' as const,
    owned_by: 'kortix',
    context_window: cfg.contextWindow,
    pricing: {
      input: cfg.inputPer1M,
      output: cfg.outputPer1M,
    },
    tier: cfg.tier,
  }));
}
