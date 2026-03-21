/**
 * Profile field visibility control.
 *
 * Members control which profile fields are visible to other members.
 * The default public fields are interests, currentFocus, and workStyle.
 * Goals and learningAreas are private by default.
 *
 * The displayName (from Member) is always visible regardless of settings.
 */

import type { ExtendedPrismaClient } from '@28k/db';

/**
 * Valid profile field names that can be toggled public/private.
 */
const VALID_PROFILE_FIELDS = new Set([
  'interests',
  'currentFocus',
  'goals',
  'learningAreas',
  'workStyle',
]);

/**
 * Default fields that are public when a profile is first created.
 * Goals and learningAreas are private by default -- they can be
 * more personal and members should opt in to sharing them.
 */
export const DEFAULT_PUBLIC_FIELDS = ['interests', 'currentFocus', 'workStyle'];

/**
 * Profile data shape (matches MemberProfile model fields).
 */
interface ProfileData {
  interests: string[];
  currentFocus: string | null;
  goals: string[];
  learningAreas: string[];
  workStyle: string | null;
  publicFields: string[];
  [key: string]: unknown;
}

/**
 * Get only the public fields from a profile.
 * Returns a partial profile containing only the fields listed in publicFields.
 * Always includes displayName regardless of visibility settings (displayName
 * comes from the Member model, not MemberProfile).
 *
 * @param profile - The full MemberProfile data
 * @returns Partial profile with only public fields populated
 */
export function getPublicProfile(profile: ProfileData): Partial<ProfileData> {
  const publicProfile: Partial<ProfileData> = {};

  for (const field of profile.publicFields) {
    if (VALID_PROFILE_FIELDS.has(field) && field in profile) {
      publicProfile[field] = profile[field];
    }
  }

  return publicProfile;
}

/**
 * Update which profile fields are visible to other members.
 *
 * @param db - Extended PrismaClient
 * @param memberId - The member's unique ID
 * @param fields - Array of field names to make public
 * @throws If any field names are invalid
 */
export async function updateVisibility(
  db: ExtendedPrismaClient,
  memberId: string,
  fields: string[],
): Promise<void> {
  // Validate that all provided fields are legitimate profile field names
  const invalidFields = fields.filter((f) => !VALID_PROFILE_FIELDS.has(f));
  if (invalidFields.length > 0) {
    throw new Error(`Invalid profile fields: ${invalidFields.join(', ')}`);
  }

  await db.memberProfile.update({
    where: { memberId },
    data: { publicFields: fields },
  });
}

/**
 * Get all valid profile field names.
 * Used by the visibility select menu to show all toggleable options.
 */
export function getValidProfileFields(): string[] {
  return Array.from(VALID_PROFILE_FIELDS);
}
