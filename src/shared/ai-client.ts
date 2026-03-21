/**
 * Centralized AI client with budget enforcement and model routing.
 *
 * All AI calls in the codebase route through this single module.
 * Provides:
 * - Single shared OpenRouter client instance
 * - DB-backed model config with hot-swap (60-second cache)
 * - Per-member daily token budget enforcement with silent degradation
 * - Per-request token tracking stored in TokenUsage table
 * - Primary/fallback model chain with automatic failover
 *
 * System-level calls (memberId='system') bypass budget checks entirely.
 */

import { OpenRouter } from '@openrouter/sdk';
import type { ChatResponse } from '@openrouter/sdk/models';
import type { ChatGenerationParams } from '@openrouter/sdk/models';
import { TZDate } from '@date-fns/tz';
import { startOfDay } from 'date-fns';
import { config } from '../core/config.js';
import type { ExtendedPrismaClient } from '../db/client.js';
import type { AICallOptions, AICallResult } from './ai-types.js';
import { estimateCostUsd } from './ai-templates.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [ai-client] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

// ─── Default Models ──────────────────────────────────────────────────────────

const DEFAULT_PRIMARY_MODEL = 'x-ai/grok-4.1-fast';
const DEFAULT_FALLBACK_MODEL = 'deepseek/deepseek-v3.2';

/** Default daily token budget per member (500K tokens). */
const DEFAULT_DAILY_TOKEN_LIMIT = 500_000;

// ─── Single OpenRouter Client ────────────────────────────────────────────────

let client: OpenRouter | null = null;

function getClient(): OpenRouter {
  if (!client) {
    client = new OpenRouter({
      apiKey: config.OPENROUTER_API_KEY,
    });
  }
  return client;
}

// ─── Model Config with DB-Backed Hot-Swap ────────────────────────────────────

/** Cached model config from BotConfig table. */
let modelConfigCache: {
  primary: string;
  fallback: string;
  updatedAt: number;
} | null = null;

/** Cache TTL in milliseconds (60 seconds). */
const MODEL_CONFIG_CACHE_TTL = 60_000;

/**
 * Get the current model configuration from BotConfig, with 60-second caching.
 * Falls back to defaults if BotConfig keys don't exist.
 */
async function getModelConfig(
  db: ExtendedPrismaClient,
): Promise<{ primary: string; fallback: string }> {
  const now = Date.now();

  if (modelConfigCache && now - modelConfigCache.updatedAt < MODEL_CONFIG_CACHE_TTL) {
    return { primary: modelConfigCache.primary, fallback: modelConfigCache.fallback };
  }

  const [primaryConfig, fallbackConfig] = await Promise.all([
    db.botConfig.findUnique({ where: { key: 'ai_primary_model' } }),
    db.botConfig.findUnique({ where: { key: 'ai_fallback_model' } }),
  ]);

  const primary = primaryConfig?.value ?? DEFAULT_PRIMARY_MODEL;
  const fallback = fallbackConfig?.value ?? DEFAULT_FALLBACK_MODEL;

  modelConfigCache = { primary, fallback, updatedAt: now };

  logger.debug(`Model config loaded: primary=${primary}, fallback=${fallback}`);

  return { primary, fallback };
}

/**
 * Clear the model config cache. Call this after /admin set-model
 * so the next AI call picks up the new model immediately.
 */
export function resetModelConfigCache(): void {
  modelConfigCache = null;
  logger.debug('Model config cache cleared');
}

// ─── Budget Check ────────────────────────────────────────────────────────────

/**
 * Check if a member is within their daily token budget.
 * Returns true if the member can make AI calls, false if budget exceeded.
 *
 * System-level calls (memberId='system') always return true.
 */
async function checkBudget(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<boolean> {
  // System calls are never budget-limited
  if (memberId === 'system') return true;

  // Get member's timezone for day boundary
  const schedule = await db.memberSchedule.findUnique({ where: { memberId } });
  const timezone = schedule?.timezone ?? 'UTC';
  const todayStart = startOfDay(new TZDate(new Date(), timezone));

  // Aggregate today's token usage
  const todayUsage = await db.tokenUsage.aggregate({
    _sum: { totalTokens: true },
    where: { memberId, createdAt: { gte: todayStart } },
  });

  // Look up custom budget or use default
  const budget = await db.memberAIBudget.findUnique({ where: { memberId } });
  const limit = budget?.dailyTokenLimit ?? DEFAULT_DAILY_TOKEN_LIMIT;

  const used = todayUsage._sum.totalTokens ?? 0;
  const withinBudget = used < limit;

  if (!withinBudget) {
    logger.info(
      `Budget exceeded for member ${memberId}: ${used}/${limit} tokens used today`,
    );
  }

  return withinBudget;
}

// ─── Main AI Call Function ───────────────────────────────────────────────────

/**
 * Make a centralized AI call with budget enforcement, model routing, and token tracking.
 *
 * Flow:
 * 1. Check daily budget for member (silent degradation if exceeded)
 * 2. Get model config from DB cache
 * 3. Try primary model, fallback to secondary on failure
 * 4. Extract and store token usage
 * 5. Return result with degradation flag
 *
 * @param db - Extended Prisma client
 * @param options - Call options (memberId, feature, messages, responseFormat)
 * @returns AI call result with content, usage, model, and degradation flag
 */
export async function callAI(
  db: ExtendedPrismaClient,
  options: AICallOptions,
): Promise<AICallResult> {
  // Step 1: Check budget
  const withinBudget = await checkBudget(db, options.memberId);
  if (!withinBudget) {
    return { content: null, usage: null, model: '', degraded: true };
  }

  // Step 2: Get model config
  const models = await getModelConfig(db);

  // Step 3: Try primary model
  const openrouter = getClient();
  let actualModel = models.primary;

  /**
   * Helper to call OpenRouter with proper typing.
   * Using stream: false ensures the SDK returns ChatResponse (not EventStream).
   */
  async function sendToModel(model: string): Promise<ChatResponse> {
    // OpenRouter models don't support json_schema — convert to json_object
    // and inject the schema into the system prompt instead
    let messages = options.messages;
    let responseFormat = options.responseFormat as Record<string, unknown> | undefined;

    if (responseFormat && (responseFormat as { type: string }).type === 'json_schema') {
      const schema = (responseFormat as { json_schema?: { schema?: object } }).json_schema?.schema;
      responseFormat = { type: 'json_object' as const };
      if (schema) {
        const schemaInstruction = `\n\nRespond with ONLY valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}`;
        messages = messages.map((msg, i) =>
          i === 0 && msg.role === 'system'
            ? { ...msg, content: msg.content + schemaInstruction }
            : msg,
        );
      }
    }

    const params: ChatGenerationParams & { stream: false } = {
      model,
      messages,
      stream: false,
    };
    if (responseFormat) {
      params.responseFormat = responseFormat as ChatGenerationParams['responseFormat'];
    }
    return openrouter.chat.send({ chatGenerationParams: params });
  }

  let completion: ChatResponse | null = null;

  try {
    completion = await sendToModel(models.primary);
  } catch (primaryError) {
    logger.warn(
      `Primary model (${models.primary}) failed for ${options.feature}/${options.memberId}: ${String(primaryError)}`,
    );

    // Step 4: Try fallback model
    try {
      completion = await sendToModel(models.fallback);
      actualModel = models.fallback;
      logger.info(
        `Fallback model (${models.fallback}) succeeded for ${options.feature}/${options.memberId}`,
      );
    } catch (fallbackError) {
      logger.error(
        `Both models failed for ${options.feature}/${options.memberId}: ${String(fallbackError)}`,
      );
      // Step 5: Both failed -- return degraded
      return { content: null, usage: null, model: '', degraded: true };
    }
  }

  // Step 6: Extract content
  const content = completion.choices[0]?.message?.content ?? null;

  // Step 7: Extract usage (null-check -- SDK types it as optional)
  let usageObj: AICallResult['usage'] = null;
  if (completion.usage) {
    usageObj = {
      promptTokens: completion.usage.promptTokens,
      completionTokens: completion.usage.completionTokens,
      totalTokens: completion.usage.totalTokens,
    };
  }

  // Step 8: Store token usage in DB (fire-and-forget)
  if (usageObj) {
    const cost = estimateCostUsd(actualModel, usageObj.promptTokens, usageObj.completionTokens);

    db.tokenUsage
      .create({
        data: {
          memberId: options.memberId,
          feature: options.feature,
          model: actualModel,
          promptTokens: usageObj.promptTokens,
          completionTokens: usageObj.completionTokens,
          totalTokens: usageObj.totalTokens,
          estimatedCostUsd: cost,
        },
      })
      .catch((err: unknown) => {
        logger.error(`Failed to store token usage: ${String(err)}`);
      });
  } else {
    logger.warn(
      `No usage data returned for ${options.feature}/${options.memberId} on model ${actualModel}`,
    );
  }

  // Step 9: Return result
  return {
    content: typeof content === 'string' ? content : null,
    usage: usageObj,
    model: actualModel,
    degraded: false,
  };
}
