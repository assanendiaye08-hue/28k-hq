/**
 * AI-powered profile tag extraction using OpenRouter.
 *
 * Takes raw natural language profile answers and extracts structured tags
 * (interests, goals, learningAreas, workStyle, currentFocus) using
 * DeepSeek V3.2 via OpenRouter's structured output API.
 *
 * Falls back to basic text splitting if OpenRouter is unavailable.
 */

import type { ExtendedPrismaClient } from '../../db/client.js';
import { callAI } from '../../shared/ai-client.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [ai-tags] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

/**
 * Structured profile tags extracted from natural language answers.
 */
export interface ProfileTags {
  interests: string[];
  currentFocus: string;
  goals: string[];
  learningAreas: string[];
  workStyle: string;
}

/**
 * Extract structured profile tags from raw natural language answers.
 *
 * Uses OpenRouter structured output (json_schema) with strict: true
 * to ensure the AI returns data in the exact expected format.
 *
 * Falls back to basic text splitting if the AI call fails.
 *
 * @param rawAnswers - Map of question keys to natural language answers
 * @returns Structured profile tags
 */
export async function extractProfileTags(
  db: ExtendedPrismaClient,
  memberId: string,
  rawAnswers: Record<string, string>,
): Promise<ProfileTags> {
  try {
    const result = await callAI(db, {
      memberId,
      feature: 'tags',
      messages: [
        {
          role: 'system',
          content: `You extract structured profile tags from natural language answers about a person's interests, goals, and work style.

Rules:
- Extract concise tags (1-3 words each)
- Normalize similar concepts ("video editing" and "editing videos" -> "video editing")
- Keep interests, goals, and learningAreas as arrays of 2-5 items each
- Determine a single currentFocus summary (1-5 words)
- Determine a single workStyle summary (1-5 words)
- If an answer is vague or missing, still produce reasonable tags from available context
- Tags should be lowercase unless they are proper nouns`,
        },
        {
          role: 'user',
          content: `Extract structured profile tags from these answers:\n${JSON.stringify(rawAnswers, null, 2)}`,
        },
      ],
      responseFormat: {
        type: 'json_schema' as const,
        jsonSchema: {
          name: 'profile_tags',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              interests: {
                type: 'array',
                items: { type: 'string' },
              },
              currentFocus: { type: 'string' },
              goals: {
                type: 'array',
                items: { type: 'string' },
              },
              learningAreas: {
                type: 'array',
                items: { type: 'string' },
              },
              workStyle: { type: 'string' },
            },
            required: [
              'interests',
              'currentFocus',
              'goals',
              'learningAreas',
              'workStyle',
            ],
            additionalProperties: false,
          },
        },
      },
    });

    if (result.degraded || !result.content) {
      logger.warn('AI unavailable, falling back to basic extraction');
      return fallbackExtraction(rawAnswers);
    }

    const tags = JSON.parse(result.content) as ProfileTags;

    logger.debug(
      `Extracted profile tags: ${JSON.stringify({
        interests: tags.interests.length,
        goals: tags.goals.length,
        learningAreas: tags.learningAreas.length,
        currentFocus: tags.currentFocus,
        workStyle: tags.workStyle,
      })}`,
    );

    return tags;
  } catch (error) {
    logger.error(`AI tag extraction failed: ${String(error)}`);
    return fallbackExtraction(rawAnswers);
  }
}

/**
 * Fallback tag extraction when OpenRouter is unavailable.
 * Splits raw text into basic tags by common delimiters.
 */
function fallbackExtraction(rawAnswers: Record<string, string>): ProfileTags {
  const splitText = (text: string | undefined): string[] => {
    if (!text) return [];
    return text
      .split(/[,;\n]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0 && s.length <= 50)
      .slice(0, 5);
  };

  return {
    interests: splitText(rawAnswers.interests || rawAnswers.situation),
    currentFocus: (rawAnswers.situation || rawAnswers.interests || 'unspecified')
      .slice(0, 50)
      .trim(),
    goals: splitText(rawAnswers.goals),
    learningAreas: splitText(rawAnswers.learn),
    workStyle: (rawAnswers.style || 'independent').slice(0, 50).trim(),
  };
}
