/**
 * AI template fallback utilities.
 *
 * Provides the budget-exceeded signal and cost estimation helper.
 * Callers check for AI_BUDGET_EXCEEDED to know when to use template responses.
 */

import { MODEL_PRICING } from './ai-types.js';

/**
 * Symbol used by callers to identify budget degradation.
 * When callAI returns { degraded: true }, the calling feature
 * should fall back to its own template-based response.
 */
export const AI_BUDGET_EXCEEDED = Symbol('AI_BUDGET_EXCEEDED');

/**
 * Estimate the USD cost of an AI call based on token counts and model pricing.
 *
 * @param model - OpenRouter model ID (e.g., 'x-ai/grok-4.1-fast')
 * @param promptTokens - Number of input tokens
 * @param completionTokens - Number of output tokens
 * @returns Estimated cost in USD, or 0 if model not in pricing table
 */
export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (
    (promptTokens / 1_000_000) * pricing.inputPerM +
    (completionTokens / 1_000_000) * pricing.outputPerM
  );
}
