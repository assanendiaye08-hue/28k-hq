/**
 * AI-powered category extraction from check-in text.
 *
 * Uses the same OpenRouter structured output pattern proven in ai-tags.ts:
 * DeepSeek V3.2 via OpenRouter SDK with responseFormat json_schema + strict: true.
 *
 * Extracts 1-3 concise activity categories and optional goal hints
 * (numeric counts mentioned in text, e.g., "sent 5 emails").
 *
 * Fallback: if AI call fails for any reason, returns { categories: ['general'], goalHints: [] }
 * -- a check-in must NEVER be blocked by an AI failure.
 */

import { OpenRouter } from '@openrouter/sdk';
import { config } from '../../core/config.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [ai-categories] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

/** Goal hint extracted from check-in text (e.g., "sent 5 emails" -> count: 5, unit: "emails"). */
export interface GoalHint {
  count: number;
  unit: string;
}

/** Result of AI category extraction from check-in text. */
export interface CategoryResult {
  categories: string[];
  goalHints: GoalHint[];
}

/** Lazy-initialized OpenRouter client. */
let openrouterClient: OpenRouter | null = null;

function getOpenRouterClient(): OpenRouter {
  if (!openrouterClient) {
    openrouterClient = new OpenRouter({
      apiKey: config.OPENROUTER_API_KEY,
    });
  }
  return openrouterClient;
}

/**
 * Extract activity categories and goal hints from check-in text using AI.
 *
 * Uses OpenRouter structured output (json_schema with strict: true) to ensure
 * the AI returns data in the exact expected format -- no manual parsing needed.
 *
 * @param text - The member's free-text check-in description
 * @returns Categories and optional goal hints; fallback on AI failure
 */
export async function extractCategories(text: string): Promise<CategoryResult> {
  try {
    const client = getOpenRouterClient();

    const completion = await client.chat.send({
      chatGenerationParams: {
        model: 'deepseek/deepseek-v3.2',
        messages: [
          {
            role: 'system' as const,
            content: `Extract 1-3 activity categories from this check-in. Categories should be concise (1-3 words).
Examples: "coding", "cold outreach", "content creation", "learning", "client work", "design".
Also determine if any numeric goals are mentioned (e.g., "sent 5 emails" -> goalHint: { count: 5, unit: "emails" }).`,
          },
          {
            role: 'user' as const,
            content: text,
          },
        ],
        responseFormat: {
          type: 'json_schema' as const,
          jsonSchema: {
            name: 'checkin_categories',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                categories: {
                  type: 'array',
                  items: { type: 'string' },
                },
                goalHints: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      count: { type: 'number' },
                      unit: { type: 'string' },
                    },
                    required: ['count', 'unit'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['categories', 'goalHints'],
              additionalProperties: false,
            },
          },
        },
        stream: false,
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      logger.warn('Empty response from OpenRouter, using fallback categories');
      return fallbackResult();
    }

    const parsed = JSON.parse(content) as CategoryResult;

    logger.debug(
      `Extracted categories: ${JSON.stringify({
        categories: parsed.categories,
        goalHints: parsed.goalHints.length,
      })}`,
    );

    return parsed;
  } catch (error) {
    logger.error(`AI category extraction failed: ${String(error)}`);
    return fallbackResult();
  }
}

/**
 * Fallback when AI is unavailable -- never block a check-in.
 */
function fallbackResult(): CategoryResult {
  return { categories: ['general'], goalHints: [] };
}
