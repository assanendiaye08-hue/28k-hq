/**
 * Prisma client extension for transparent field encryption.
 *
 * Since prisma-field-encryption does NOT support Prisma 7,
 * this implements encryption as a custom Prisma client extension
 * using $extends with the query component.
 *
 * Encrypted fields are listed in ENCRYPTED_FIELDS. On write operations
 * (create, update, upsert), the extension encrypts those fields using
 * the member's derived key. After query execution, it decrypts them
 * in the result.
 *
 * The master encryption key comes from environment config -- never hardcoded.
 */

import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt, deriveMemberKey } from '../shared/crypto.js';
import { config } from '../core/config.js';

/**
 * Map of model names to their encrypted field names.
 * Only rawAnswers is encrypted -- structured tags are intentionally
 * cleartext for queries, matching, and leaderboards.
 */
const ENCRYPTED_FIELDS: Record<string, string[]> = {
  MemberProfile: ['rawAnswers'],
};

/** Write operations that may contain data to encrypt. */
const WRITE_OPERATIONS = new Set(['create', 'update', 'upsert', 'createMany']);

/**
 * Get the master encryption key as a Buffer from config.
 * Parsed once per call from the hex-encoded environment variable.
 */
function getMasterKey(): Buffer {
  return Buffer.from(config.MASTER_ENCRYPTION_KEY, 'hex');
}

/**
 * Derive the per-member encryption key from a memberId.
 */
function getMemberKey(memberId: string): Buffer {
  return deriveMemberKey(getMasterKey(), memberId);
}

/**
 * Extract memberId from Prisma operation args.
 * Checks data, where, and nested create/update structures.
 */
function extractMemberId(args: Record<string, unknown>): string | null {
  // Direct memberId in data
  const data = args.data as Record<string, unknown> | undefined;
  if (data?.memberId && typeof data.memberId === 'string') {
    return data.memberId;
  }

  // memberId in where clause
  const where = args.where as Record<string, unknown> | undefined;
  if (where?.memberId && typeof where.memberId === 'string') {
    return where.memberId;
  }

  // For upsert: check create and update sub-objects
  const create = (args as Record<string, unknown>).create as Record<string, unknown> | undefined;
  if (create?.memberId && typeof create.memberId === 'string') {
    return create.memberId;
  }

  const update = (args as Record<string, unknown>).update as Record<string, unknown> | undefined;
  if (update?.memberId && typeof update.memberId === 'string') {
    return update.memberId;
  }

  return null;
}

/**
 * Encrypt specified fields in a data object.
 */
function encryptFields(
  data: Record<string, unknown>,
  fields: string[],
  memberKey: Buffer,
): void {
  for (const field of fields) {
    if (data[field] != null && typeof data[field] === 'string') {
      data[field] = encrypt(data[field] as string, memberKey);
    }
  }
}

/**
 * Decrypt specified fields in a result object or array of objects.
 */
function decryptResultFields(
  result: unknown,
  fields: string[],
  memberKey: Buffer,
): void {
  if (result == null) return;

  if (Array.isArray(result)) {
    for (const item of result) {
      decryptResultFields(item, fields, memberKey);
    }
    return;
  }

  if (typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    for (const field of fields) {
      if (obj[field] != null && typeof obj[field] === 'string') {
        try {
          obj[field] = decrypt(obj[field] as string, memberKey);
        } catch {
          // If decryption fails (e.g., field wasn't actually encrypted),
          // leave the value as-is to avoid data loss
        }
      }
    }
  }
}

/**
 * Apply transparent encryption extension to a PrismaClient.
 *
 * Returns an extended client that automatically encrypts fields on write
 * and decrypts on read for models listed in ENCRYPTED_FIELDS.
 *
 * @param prisma - The base PrismaClient instance
 * @returns Extended PrismaClient with encryption hooks
 */
export function withEncryption(prisma: PrismaClient) {
  return prisma.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        // Skip if this model has no encrypted fields
        if (!model || !ENCRYPTED_FIELDS[model]) {
          return query(args);
        }

        const fields = ENCRYPTED_FIELDS[model];
        const typedArgs = args as Record<string, unknown>;

        // Encrypt on write operations
        if (WRITE_OPERATIONS.has(operation)) {
          const memberId = extractMemberId(typedArgs);

          if (memberId) {
            const memberKey = getMemberKey(memberId);

            // Encrypt fields in data
            const data = typedArgs.data;
            if (data && typeof data === 'object') {
              encryptFields(data as Record<string, unknown>, fields, memberKey);
            }

            // Handle upsert: encrypt in both create and update
            if (operation === 'upsert') {
              const createData = typedArgs.create;
              if (createData && typeof createData === 'object') {
                encryptFields(createData as Record<string, unknown>, fields, memberKey);
              }
              const updateData = typedArgs.update;
              if (updateData && typeof updateData === 'object') {
                encryptFields(updateData as Record<string, unknown>, fields, memberKey);
              }
            }
          }
        }

        // Execute query, then decrypt results
        const result = await query(args);

        if (result != null) {
          // For read results, we need the memberId from the result to derive the key
          const resultMemberId = extractMemberIdFromResult(result);
          if (resultMemberId) {
            const memberKey = getMemberKey(resultMemberId);
            decryptResultFields(result, fields, memberKey);
          }
        }

        return result;
      },
    },
  });
}

/**
 * Extract memberId from a query result for decryption.
 */
function extractMemberIdFromResult(result: unknown): string | null {
  if (result == null) return null;

  // Single result object
  if (typeof result === 'object' && !Array.isArray(result)) {
    const obj = result as Record<string, unknown>;
    if (typeof obj.memberId === 'string') return obj.memberId;
  }

  // Array of results -- use first item's memberId (all should be same member)
  if (Array.isArray(result) && result.length > 0) {
    const first = result[0] as Record<string, unknown>;
    if (typeof first?.memberId === 'string') return first.memberId;
  }

  return null;
}
