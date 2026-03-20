/**
 * AI-powered resource tag extraction using OpenRouter.
 *
 * Extracts a short topic title and interest tags from a resource post's
 * message text. Uses DeepSeek V3.2 via OpenRouter with structured JSON output.
 *
 * This is called fire-and-forget from the handler -- failures are silent.
 * Does NOT fetch external URLs; only analyzes the message text itself.
 *
 * Falls back to { topic: 'Resource', tags: [] } if AI is unavailable.
 */

import { OpenRouter } from '@openrouter/sdk';
import { config } from '../../core/config.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [resource-tagger] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

/** Result of resource tag extraction. */
export interface ResourceTags {
  topic: string;
  tags: string[];
}

/**
 * Lazy-initialized OpenRouter client (avoids errors if key not set at import time).
 */
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
 * Extract a topic title and interest tags from a resource post's message text.
 *
 * Uses OpenRouter structured output (json_schema) with strict: true
 * to ensure the AI returns data in the exact expected format.
 *
 * @param messageContent - The raw message text from the resource post
 * @returns Topic title (5-10 words) and 2-4 interest tags
 */
export async function extractResourceTags(
  messageContent: string,
): Promise<ResourceTags> {
  try {
    const client = getOpenRouterClient();

    const completion = await client.chat.send({
      chatGenerationParams: {
        model: 'deepseek/deepseek-v3.2',
        messages: [
          {
            role: 'system' as const,
            content: `You extract a topic title and interest tags from a resource post shared in a Discord server.

Rules:
- Extract a concise topic title (5-10 words) summarizing what the resource is about
- Extract 2-4 interest tags (1-3 words each, lowercase)
- Tags should describe the subject area, technology, or skill involved
- If the message is too short or vague, return topic "Resource" and empty tags
- Do NOT attempt to visit or analyze any URLs -- only use the message text`,
          },
          {
            role: 'user' as const,
            content: `Extract topic and tags from this resource post:\n\n${messageContent}`,
          },
        ],
        responseFormat: {
          type: 'json_schema' as const,
          jsonSchema: {
            name: 'resource_tags',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                topic: { type: 'string' },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['topic', 'tags'],
              additionalProperties: false,
            },
          },
        },
        stream: false,
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      logger.warn('Empty response from OpenRouter, using fallback');
      return { topic: 'Resource', tags: [] };
    }

    const result = JSON.parse(content) as ResourceTags;
    logger.debug(`Extracted resource tags: topic="${result.topic}", tags=[${result.tags.join(', ')}]`);
    return result;
  } catch (error) {
    logger.error(`Resource tag extraction failed: ${String(error)}`);
    return { topic: 'Resource', tags: [] };
  }
}
