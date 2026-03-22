/**
 * Shared types for AI operations.
 *
 * Used by the centralized AI client (ai-client.ts) and all consumer call sites.
 * Defines the feature taxonomy, call options, result shape, and model pricing.
 */

/**
 * AI feature identifier -- maps to the `feature` column in TokenUsage.
 * Each feature corresponds to a distinct call site in the codebase.
 */
export type AIFeature =
  | 'chat'
  | 'brief'
  | 'nudge'
  | 'filter'
  | 'categories'
  | 'tags'
  | 'planning'
  | 'summary'
  | 'tagger'
  | 'timer'
  | 'reflection'
  | 'recap'
  | 'intent';

/**
 * Tool definition for LLM function calling.
 * Follows the OpenAI-compatible tool format used by OpenRouter.
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

/**
 * Options for a single AI call through the centralized client.
 */
export interface AICallOptions {
  /** Member ID for budget tracking. Use 'system' for system-level calls. */
  memberId: string;
  /** Which feature is making this call (for per-feature cost breakdown). */
  feature: AIFeature;
  /** Messages array in OpenAI-compatible format. */
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  /** Optional structured output format (json_schema). */
  responseFormat?: object;
  /** Optional tool definitions for LLM function calling. */
  tools?: ToolDefinition[];
}

/**
 * Result returned from every AI call.
 */
export interface AICallResult {
  /** The AI-generated content, or null if degraded/failed. */
  content: string | null;
  /** Token usage from the response, or null if unavailable. */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
  /** The model that actually served the request (empty string if degraded). */
  model: string;
  /** True if budget was exceeded or both models failed -- caller should use template fallback. */
  degraded: boolean;
  /** Tool calls returned by the LLM, if any. Present when tools were provided and the LLM chose to invoke one. */
  toolCalls?: Array<{ id: string; function: { name: string; arguments: string } }>;
}

/**
 * Model pricing table for cost estimation.
 * Prices are in USD per million tokens.
 */
export const MODEL_PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  'x-ai/grok-4.1-fast': { inputPerM: 0.20, outputPerM: 0.50 },
  'deepseek/deepseek-v3.2': { inputPerM: 0.26, outputPerM: 0.38 },
};
