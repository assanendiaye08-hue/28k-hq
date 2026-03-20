/**
 * Database client -- PrismaClient singleton with encryption extension.
 *
 * Exports:
 * - db: The extended PrismaClient with transparent field encryption
 * - disconnectDb(): Gracefully close the database connection
 *
 * The client connects lazily on first query (Prisma 7 default behavior).
 * The encryption extension is applied via withEncryption(), which intercepts
 * reads/writes on models with encrypted fields (see encryption.ts).
 */

import { PrismaClient } from '@prisma/client';
import { withEncryption } from './encryption.js';

/**
 * Create the base PrismaClient singleton.
 * Logging is enabled in development for query debugging.
 */
const basePrisma = new PrismaClient({
  log:
    process.env.NODE_ENV === 'development'
      ? ['query', 'warn', 'error']
      : ['warn', 'error'],
});

/**
 * Extended PrismaClient with transparent field encryption.
 * Use this for all database operations throughout the application.
 */
export const db = withEncryption(basePrisma);

/**
 * Type of the extended database client.
 * Use this when typing parameters or context objects that receive the db.
 */
export type ExtendedPrismaClient = typeof db;

/**
 * Disconnect the database client.
 * Call during graceful shutdown to close the connection pool.
 */
export async function disconnectDb(): Promise<void> {
  await basePrisma.$disconnect();
}
