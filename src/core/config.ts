import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env in development
dotenv.config();

/**
 * Environment variable schema with validation.
 * Crashes immediately with descriptive errors if required vars are missing.
 */
const envSchema = z.object({
  // Discord
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
  DISCORD_CLIENT_ID: z.string().min(1, 'DISCORD_CLIENT_ID is required'),
  DISCORD_GUILD_ID: z.string().min(1, 'DISCORD_GUILD_ID is required'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // AI
  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),

  // Encryption (32-byte hex = 64 hex characters)
  MASTER_ENCRYPTION_KEY: z
    .string()
    .length(64, 'MASTER_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
    .regex(/^[0-9a-fA-F]+$/, 'MASTER_ENCRYPTION_KEY must be valid hexadecimal'),

  // Optional
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Config = z.infer<typeof envSchema>;

/**
 * Validate environment variables and return typed config.
 * Call this at the very start of the application -- fail fast.
 */
function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    console.error('Environment validation failed:\n' + errors);
    console.error('\nSee .env.example for required variables.');
    process.exit(1);
  }

  return result.data;
}

/**
 * Typed, validated configuration object.
 * Accessing this triggers validation on first import.
 */
export const config = loadConfig();
