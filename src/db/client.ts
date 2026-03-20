/**
 * Database client placeholder.
 *
 * Plan 02 will replace this with the real PrismaClient setup including:
 * - PrismaClient initialization
 * - Custom encryption extension ($extends)
 * - Connection management
 *
 * For now, exports null so the bot core can compile and the module system
 * can work before the database is set up.
 */

let db: unknown = null;

/**
 * Get the database client instance.
 * Returns null until Plan 02 initializes the real PrismaClient.
 */
export function getDb(): unknown {
  return db;
}

/**
 * Set the database client instance.
 * Called during initialization once the real PrismaClient is created.
 */
export function setDb(client: unknown): void {
  db = client;
}

/**
 * Disconnect the database client.
 * No-op until Plan 02 provides a real client.
 */
export async function disconnectDb(): Promise<void> {
  if (db && typeof (db as { $disconnect?: () => Promise<void> }).$disconnect === 'function') {
    await (db as { $disconnect: () => Promise<void> }).$disconnect();
  }
}
