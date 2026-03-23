/**
 * Onboarding slash command handler -- /setup
 *
 * Flow:
 * 1. deferReply (ephemeral) -- must respond within 3 seconds
 * 2. Check if already set up (has Member role)
 * 3. Run DM conversation flow (5 questions)
 * 4. On success:
 *    a. Create Member record with encryption salt
 *    b. Create DiscordAccount linking Discord ID to Member
 *    c. Derive member encryption key, generate recovery key
 *    d. Store raw answers as encrypted JSON in MemberProfile
 *    e. Create PrivateSpace record (always DM type)
 *    f. Send recovery key via DM
 *    g. Assign Member role (unlocks all gated channels)
 *    h. Edit reply with success message
 *    i. Emit memberSetupComplete event
 */

import {
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';
import type { ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '@28k/db';
import { runSetupFlow, type SetupFlowResult, type SetupFlowError } from './setup-flow.js';
import {
  deriveMemberKey,
  generateRecoveryKey,
  generateEncryptionSalt,
} from '@28k/db';
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
  return runSetup(interaction, ctx);
}

/**
 * Handle the "Get Started" button click from #welcome.
 * Replies instantly (no "thinking...") and runs the same setup logic.
 */
export async function handleSetupButton(
  interaction: ButtonInteraction,
  ctx: ModuleContext,
): Promise<void> {
  // Reply instantly instead of deferring (avoids "thinking..." noise)
  await interaction.reply({
    content: "Check your DMs! I've sent you a message to get started.",
    flags: MessageFlags.Ephemeral,
  });
  return runSetup(interaction, ctx, true);
}

/**
 * Core setup logic shared by /setup command and Get Started button.
 */
async function runSetup(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  ctx: ModuleContext,
  alreadyReplied = false,
): Promise<void> {
  const { logger, events } = ctx;
  const db = ctx.db as ExtendedPrismaClient;

  // Step 1: Defer reply immediately (ephemeral) -- skip if button already replied
  if (!alreadyReplied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

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

  // Step 2b: Check for partial setup (DB records exist but role missing)
  const existingAccount = await db.discordAccount.findUnique({
    where: { discordId: interaction.user.id },
    include: { member: true },
  });

  if (existingAccount) {
    // DB records exist from a previous partial run -- recover by assigning role
    try {
      if (memberRole) {
        await guildMember.roles.add(memberRole, 'Recovered from incomplete /setup');
      }
      await interaction.editReply("You're already set up! All channels should be unlocked.");
    } catch {
      await interaction.editReply(
        'Your account exists but I couldn\'t assign the role. Please contact an admin.',
      );
    }
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

  // Step 4: Success -- create records in DB (atomic transaction)
  try {
    const { answers, displayName } = result;

    // All DB writes in a transaction for atomicity
    let memberRecord: { id: string };
    let recoveryKey: string;

    try {
      const txResult = await db.$transaction(async (tx) => {
        // Generate encryption salt (pure computation)
        const encryptionSalt = generateEncryptionSalt();

        // Create Member record
        const member = await tx.member.create({
          data: {
            displayName,
            encryptionSalt,
            recoveryKeyHash: '', // Placeholder -- updated below after key derivation
          },
        });

        // Derive member encryption key and generate recovery key
        const masterKey = Buffer.from(config.MASTER_ENCRYPTION_KEY, 'hex');
        const memberKey = deriveMemberKey(masterKey, member.id);
        const recKey = generateRecoveryKey(memberKey);

        // Update recovery key hash (store hash, not the key itself)
        const crypto = await import('node:crypto');
        const recoveryKeyHash = crypto
          .createHash('sha256')
          .update(recKey)
          .digest('hex');

        await tx.member.update({
          where: { id: member.id },
          data: { recoveryKeyHash },
        });

        // Create DiscordAccount linking Discord ID to Member
        await tx.discordAccount.create({
          data: {
            discordId: interaction.user.id,
            memberId: member.id,
          },
        });

        // Store raw answers as encrypted JSON in MemberProfile
        const rawAnswersJson = JSON.stringify(answers);

        await tx.memberProfile.create({
          data: {
            memberId: member.id,
            rawAnswers: rawAnswersJson,
            interests: [],
            goals: [],
            learningAreas: [],
            publicFields: ['interests', 'currentFocus'],
          },
        });

        // Create PrivateSpace record (always DM -- no channel option)
        await tx.privateSpace.create({
          data: {
            memberId: member.id,
            type: 'DM',
            channelId: null,
          },
        });

        // MemberSchedule is created during coaching onboarding (first DM to Jarvis)

        return { memberRecord: member, recoveryKey: recKey };
      });

      memberRecord = txResult.memberRecord;
      recoveryKey = txResult.recoveryKey;
    } catch (txError) {
      throw txError;
    }

    // 4c: Send recovery key + welcome guide via DM (non-critical, after transaction success)
    try {
      const dm = await guildMember.createDM();
      await dm.send(
        "You're all set! One last thing -- here's your personal recovery key. " +
        "Save it somewhere safe. It can decrypt your data independently if needed.\n\n" +
        `\`\`\`\n${recoveryKey}\n\`\`\`\n\n` +
        "Keep this private. Don't share it with anyone.",
      );

      // Send feature guide
      await dm.send(
        "**Here's what you've unlocked:**\n\n" +
        "**Just talk to me here** — I know your goals, track your progress, and keep you accountable. " +
        "Tell me what you're working on, ask me to set a reminder, break down a goal, or just check in. Plain English, no commands.\n\n" +
        "**First message you send me** — I'll ask your timezone, morning brief time, and how hard you want me to push you. Takes one minute.\n\n" +
        "**Desktop app** — Download 28K HQ for Mac/Windows to run focus timers in your menu bar and manage goals visually.\n\n" +
        "`/goals` — Quick view of your active goals\n" +
        "`/reminders` — See your upcoming reminders\n" +
        "`/leaderboard` — See the rankings\n\n" +
        "Send me a message here when you're ready.",
      );
    } catch {
      logger.warn(
        `Could not send recovery key to ${guildMember.user.tag} via DM. ` +
        'They may have closed DMs after setup.',
      );
    }

    // 4c2: Seed initial conversation so Jarvis has context for first interaction
    try {
      await db.conversationMessage.create({
        data: {
          memberId: memberRecord.id,
          role: 'assistant',
          content: `Hey ${displayName}! I'm Jarvis, your personal operator. I've got your profile loaded — I know what you're working on and what you're aiming for. DM me anytime you need help, want to set goals, start a focus timer, or just need someone to keep you accountable. Let's get to work.`,
        },
      });
    } catch {
      logger.warn('Could not seed initial conversation message');
    }

    // 4d: Assign Member role (non-critical, idempotent)
    if (memberRole) {
      await guildMember.roles.add(memberRole, 'Completed /setup onboarding');
      logger.info(`Assigned Member role to ${guildMember.user.tag}`);
    } else {
      logger.warn('Member role not found -- could not assign after setup');
    }

    // 4e: Edit reply with success message
    await interaction.editReply(
      "You're all set! Check out the server -- everything is unlocked now. " +
      "Your private space is right here in DMs.",
    );

    // 4f: Emit memberSetupComplete event
    events.emit('memberSetupComplete', memberRecord.id, interaction.user.id);

    logger.info(
      `Setup complete for ${guildMember.user.tag}: member=${memberRecord.id}`,
    );
  } catch (error) {
    logger.error(`Failed to complete setup for ${guildMember.user.tag}:`, error);
    await interaction.editReply(
      'Something went wrong during setup. Please try `/setup` again. ' +
      'If the problem persists, contact an admin.',
    );
  }
}
