/**
 * Onboarding slash command handler -- /setup
 *
 * Flow:
 * 1. deferReply (ephemeral) -- must respond within 3 seconds
 * 2. Check if already set up (has Member role)
 * 3. Run DM conversation flow (5 questions + space preference)
 * 4. On success:
 *    a. Create Member record with encryption salt
 *    b. Create DiscordAccount linking Discord ID to Member
 *    c. Derive member encryption key, generate recovery key
 *    d. Store raw answers as encrypted JSON in MemberProfile
 *    e. Create PrivateSpace record
 *    f. If CHANNEL type: create private channel
 *    g. Send recovery key via DM
 *    h. Assign Member role (unlocks all gated channels)
 *    i. Edit reply with success message
 *    j. Emit memberSetupComplete event
 */

import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';
import type { ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { runSetupFlow, type SetupFlowResult, type SetupFlowError } from './setup-flow.js';
import { createPrivateChannel } from './channel-setup.js';
import {
  deriveMemberKey,
  generateRecoveryKey,
  generateEncryptionSalt,
} from '../../shared/crypto.js';
import { config } from '../../core/config.js';

/**
 * Slash command builder for /setup.
 */
export const setupCommand = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Set up your profile and unlock the server');

/**
 * Check if a result is an error (type guard).
 */
function isError(result: SetupFlowResult | SetupFlowError): result is SetupFlowError {
  return 'error' in result;
}

/**
 * Handle the /setup command interaction.
 */
export async function handleSetup(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const { logger, events } = ctx;
  const db = ctx.db as ExtendedPrismaClient;

  // Step 1: Defer reply immediately (ephemeral)
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const member = interaction.member;
  if (!member || !interaction.guild) {
    await interaction.editReply('This command can only be used in a server.');
    return;
  }

  const guildMember = await interaction.guild.members.fetch(interaction.user.id);

  // Step 2: Check if already set up
  const memberRole = interaction.guild.roles.cache.find((r) => r.name === 'Member');
  if (memberRole && guildMember.roles.cache.has(memberRole.id)) {
    await interaction.editReply("You're already set up! All channels should be unlocked.");
    return;
  }

  // Step 3: Run DM conversation flow
  const result = await runSetupFlow(guildMember, logger);

  if (isError(result)) {
    switch (result.error) {
      case 'dms_closed':
        await interaction.editReply(
          "I couldn't send you a DM. Please enable DMs from server members " +
          "(right-click the server name -> Privacy Settings -> Direct Messages) " +
          "and run `/setup` again.",
        );
        return;
      case 'timeout':
        await interaction.editReply(
          "Setup timed out. Run `/setup` again when you're ready.",
        );
        return;
      case 'cancelled':
        await interaction.editReply(
          'Setup was cancelled. Run `/setup` when you want to try again.',
        );
        return;
    }
  }

  // Step 4: Success -- create records in DB
  try {
    const { answers, spaceType, displayName } = result;

    // 4a: Generate encryption salt
    const encryptionSalt = generateEncryptionSalt();

    // 4b: Create Member record
    const memberRecord = await db.member.create({
      data: {
        displayName,
        encryptionSalt,
        recoveryKeyHash: '', // Placeholder -- updated below after key derivation
      },
    });

    // 4c: Derive member encryption key and generate recovery key
    const masterKey = Buffer.from(config.MASTER_ENCRYPTION_KEY, 'hex');
    const memberKey = deriveMemberKey(masterKey, memberRecord.id);
    const recoveryKey = generateRecoveryKey(memberKey);

    // Update recovery key hash (store hash, not the key itself)
    const crypto = await import('node:crypto');
    const recoveryKeyHash = crypto
      .createHash('sha256')
      .update(recoveryKey)
      .digest('hex');

    await db.member.update({
      where: { id: memberRecord.id },
      data: { recoveryKeyHash },
    });

    // 4d: Create DiscordAccount linking Discord ID to Member
    await db.discordAccount.create({
      data: {
        discordId: interaction.user.id,
        memberId: memberRecord.id,
      },
    });

    // 4e: Store raw answers as encrypted JSON in MemberProfile
    // The encryption extension will automatically encrypt rawAnswers
    const rawAnswersJson = JSON.stringify(answers);

    await db.memberProfile.create({
      data: {
        memberId: memberRecord.id,
        rawAnswers: rawAnswersJson,
        // Structured tag fields left empty -- Plan 04 handles AI extraction
        interests: [],
        goals: [],
        learningAreas: [],
        publicFields: ['interests', 'currentFocus'], // Default public fields
      },
    });

    // 4f: Create PrivateSpace record
    let channelId: string | null = null;

    if (spaceType === 'CHANNEL' && interaction.guild) {
      // 4g: Create private channel if CHANNEL type chosen
      const botId = interaction.client.user.id;
      const privateChannel = await createPrivateChannel(
        interaction.guild,
        guildMember,
        botId,
      );
      channelId = privateChannel.id;
    }

    await db.privateSpace.create({
      data: {
        memberId: memberRecord.id,
        type: spaceType,
        channelId,
      },
    });

    // 4h: Send recovery key via DM
    try {
      const dm = await guildMember.createDM();
      await dm.send(
        "You're all set! One last thing -- here's your personal recovery key. " +
        "Save it somewhere safe. It can decrypt your data independently if needed.\n\n" +
        `\`\`\`\n${recoveryKey}\n\`\`\`\n\n` +
        "Keep this private. Don't share it with anyone.",
      );
    } catch {
      logger.warn(
        `Could not send recovery key to ${guildMember.user.tag} via DM. ` +
        'They may have closed DMs after setup.',
      );
    }

    // 4i: Assign Member role (unlocks all gated channels)
    if (memberRole) {
      await guildMember.roles.add(memberRole, 'Completed /setup onboarding');
      logger.info(`Assigned Member role to ${guildMember.user.tag}`);
    } else {
      logger.warn('Member role not found -- could not assign after setup');
    }

    // 4j: Edit reply with success message
    if (spaceType === 'CHANNEL' && channelId) {
      await interaction.editReply(
        "You're all set! Check out the server -- everything is unlocked now. " +
        `Your private space is <#${channelId}>.`,
      );
    } else {
      await interaction.editReply(
        "You're all set! Check out the server -- everything is unlocked now. " +
        "Your private space is right here in DMs.",
      );
    }

    // 4k: Emit memberSetupComplete event
    events.emit('memberSetupComplete', memberRecord.id, interaction.user.id);

    logger.info(
      `Setup complete for ${guildMember.user.tag}: member=${memberRecord.id}, space=${spaceType}`,
    );
  } catch (error) {
    logger.error(`Failed to complete setup for ${guildMember.user.tag}:`, error);
    await interaction.editReply(
      'Something went wrong during setup. Please try `/setup` again. ' +
      'If the problem persists, contact an admin.',
    );
  }
}
