/**
 * Cryptographic utilities for per-member data encryption.
 *
 * Uses AES-256-GCM with HKDF-derived per-member keys.
 * All functions use Node.js built-in crypto module -- no external dependencies.
 *
 * Key hierarchy:
 *   MASTER_ENCRYPTION_KEY (env var, 32 bytes hex)
 *     -> deriveMemberKey(masterKey, memberId) via HKDF
 *       -> encrypt/decrypt with AES-256-GCM
 *
 * Recovery key = base64url-encoded per-member key, given to member during setup.
 */

import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits -- recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Derive a per-member encryption key from the master key using HKDF.
 *
 * @param masterKey - The master encryption key (32 bytes)
 * @param memberId - The member's unique CUID (used as HKDF salt)
 * @returns A 32-byte derived key unique to this member
 */
export function deriveMemberKey(masterKey: Buffer, memberId: string): Buffer {
  return Buffer.from(
    crypto.hkdfSync('sha256', masterKey, memberId, 'discord-hustler-member-key', 32),
  );
}

/**
 * Encrypt a plaintext string using AES-256-GCM with the given member key.
 *
 * Output format: base64(iv + authTag + ciphertext)
 * - iv: 12 bytes
 * - authTag: 16 bytes
 * - ciphertext: variable length
 *
 * @param plaintext - The string to encrypt
 * @param memberKey - The 32-byte per-member key
 * @returns Base64-encoded packed ciphertext
 */
export function encrypt(plaintext: string, memberKey: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, memberKey, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: iv + authTag + ciphertext
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypt a packed ciphertext string using AES-256-GCM with the given member key.
 *
 * @param packed - Base64-encoded packed ciphertext (iv + authTag + ciphertext)
 * @param memberKey - The 32-byte per-member key
 * @returns The original plaintext string
 * @throws If the key is wrong or data has been tampered with
 */
export function decrypt(packed: string, memberKey: Buffer): string {
  const buffer = Buffer.from(packed, 'base64');
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, memberKey, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * Generate a recovery key from a per-member key.
 * The recovery key is given to the member during setup so they can
 * independently decrypt their data if needed.
 *
 * Format: DHKEY-<base64url encoded key>
 *
 * @param memberKey - The 32-byte per-member key
 * @returns A recovery key string in the format "DHKEY-<base64url>"
 */
export function generateRecoveryKey(memberKey: Buffer): string {
  return 'DHKEY-' + memberKey.toString('base64url');
}

/**
 * Generate a random encryption salt for a new member.
 * Used as part of HKDF key derivation context.
 *
 * @returns A 32-character hex string (16 random bytes)
 */
export function generateEncryptionSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}
