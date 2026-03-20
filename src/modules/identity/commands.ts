/**
 * Identity command handlers: /link, /verify, /unlink.
 *
 * /link - Generate a 6-character code to link another Discord account.
 *         The code is shown ephemerally and expires in 5 minutes.
 *
 * /verify - Verify a link code from another Discord account.
 *           On success, both accounts share the same member identity.
 *
 * /unlink - Remove a linked Discord account from your identity.
 *           Cannot unlink the last account.
 */

import {
  type ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  MessageFlags,
} from 'discord.js';
import type { ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { successEmbed, errorEmbed, infoEmbed } from '../../shared/embeds.js';
import {
  generateLinkCode,
  verifyLinkCode,
  unlinkAccount,
  getLinkedAccounts,
} from './linking.js';

/**
 * Handle the /link command.
 * Generates a time-limited code for the member to verify on another Discord account.
 */
export async function linkCommand(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });

  // Check if the caller has completed /setup (has a DiscordAccount linked to a Member)
  const account = await db.discordAccount.findUnique({
    where: { discordId: interaction.user.id },
  });

  if (!account) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Setup Required',
          'You need to run `/setup` first before you can link accounts.',
        ),
      ],
    });
    return;
  }

  // Generate the link code
  const { code, expiresAt } = await generateLinkCode(db, interaction.user.id);

  const expiryTimestamp = Math.floor(expiresAt.getTime() / 1000);

  await interaction.editReply({
    embeds: [
      infoEmbed(
        'Account Link Code',
        [
          `Your link code: **\`${code}\`**`,
          '',
          `Run \`/verify ${code}\` from your other Discord account within 5 minutes.`,
          '',
          `Expires: <t:${expiryTimestamp}:R>`,
          '',
          '*This code can only be used once.*',
        ].join('\n'),
      ),
    ],
  });
}

/**
 * Handle the /verify command.
 * Validates a link code and connects this account to the same member identity.
 */
export async function verifyCommand(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });

  const code = interaction.options.getString('code', true).toUpperCase().trim();

  // Verify the link code
  const result = await verifyLinkCode(db, interaction.user.id, code);

  if (result.success) {
    // Successfully linked -- assign the Member role and copy rank roles
    if (interaction.guild && result.memberId) {
      try {
        const guildMember = await interaction.guild.members.fetch(interaction.user.id);

        // Find the "Member" role (assigned during setup to unlock channels)
        const memberRole = interaction.guild.roles.cache.find(
          (r) => r.name === 'Member',
        );
        if (memberRole && !guildMember.roles.cache.has(memberRole.id)) {
          await guildMember.roles.add(memberRole, 'Account linked via /verify');
        }

        // Copy rank roles from existing linked accounts
        const linkedAccounts = await getLinkedAccounts(db, result.memberId);
        const otherAccountIds = linkedAccounts
          .map((a) => a.discordId)
          .filter((id) => id !== interaction.user.id);

        if (otherAccountIds.length > 0) {
          // Get roles from the first existing linked account
          const existingMember = await interaction.guild.members
            .fetch(otherAccountIds[0])
            .catch(() => null);

          if (existingMember) {
            // Copy interest tag roles and rank roles (not @everyone, not managed roles)
            const rolesToCopy = existingMember.roles.cache.filter(
              (r) =>
                r.id !== interaction.guild!.id && // Not @everyone
                !r.managed && // Not bot-managed
                r.name !== 'Member', // Already handled above
            );

            if (rolesToCopy.size > 0) {
              await guildMember.roles.add(
                rolesToCopy.map((r) => r.id),
                'Copied roles from linked account',
              );
            }
          }
        }
      } catch (error) {
        ctx.logger.error('Failed to assign roles after account link:', error);
        // Non-blocking -- the link itself succeeded
      }
    }

    ctx.events.emit('accountLinked', result.memberId, interaction.user.id);

    await interaction.editReply({
      embeds: [
        successEmbed(
          'Account Linked!',
          [
            'This account is now connected to your identity.',
            'You share the same profile, XP, and data across all linked accounts.',
          ].join('\n'),
        ),
      ],
    });
  } else {
    // Handle error cases
    const errorMessages: Record<string, string> = {
      invalid_or_expired:
        'That code is invalid or has expired. Generate a new one with `/link`.',
      requester_not_setup:
        "The account that generated this code hasn't completed `/setup` yet.",
      already_linked_different:
        'This account is already linked to a different member. Use `/unlink` first if you want to link to a different identity.',
      cap_reached:
        'You\'ve reached the maximum of 5 linked accounts. Unlink one first with `/unlink`.',
    };

    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Link Failed',
          errorMessages[result.error || 'invalid_or_expired'],
        ),
      ],
    });
  }
}

/**
 * Handle the /unlink command.
 * Shows a select menu of all linked accounts and lets the member remove one.
 */
export async function unlinkCommand(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });

  // Look up the member via their Discord account
  const account = await db.discordAccount.findUnique({
    where: { discordId: interaction.user.id },
  });

  if (!account) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Not Linked',
          'You don\'t have a linked account. Run `/setup` first.',
        ),
      ],
    });
    return;
  }

  // Get all linked accounts for this member
  const linkedAccounts = await getLinkedAccounts(db, account.memberId);

  if (linkedAccounts.length <= 1) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Cannot Unlink',
          'You can\'t unlink your only account. You need at least one Discord account connected to your identity.',
        ),
      ],
    });
    return;
  }

  // Build a select menu listing all linked accounts
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('unlink_account_select')
    .setPlaceholder('Select an account to unlink')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      linkedAccounts.map((acc) => {
        const isCurrent = acc.discordId === interaction.user.id;
        return new StringSelectMenuOptionBuilder()
          .setLabel(
            isCurrent ? `${acc.discordId} (this account)` : acc.discordId,
          )
          .setValue(acc.discordId)
          .setDescription(
            `Linked ${new Date(acc.linkedAt).toLocaleDateString()}${isCurrent ? ' - current account' : ''}`,
          );
      }),
    );

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const response = await interaction.editReply({
    content: 'Select which account to unlink:',
    components: [selectRow],
  });

  // Collect select menu interaction (60 second timeout)
  try {
    const selectInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: (i) =>
        i.user.id === interaction.user.id && i.customId === 'unlink_account_select',
      time: 60_000,
    });

    const selectedDiscordId = selectInteraction.values[0];

    const result = await unlinkAccount(db, selectedDiscordId);

    if (result.success) {
      await selectInteraction.update({
        embeds: [
          successEmbed(
            'Account Unlinked',
            `Account \`${selectedDiscordId}\` is no longer connected to your identity.`,
          ),
        ],
        components: [],
        content: '',
      });
    } else {
      const errorMsg =
        result.error === 'last_account'
          ? 'Cannot unlink the last account. You need at least one connected.'
          : 'That account was not found.';

      await selectInteraction.update({
        embeds: [errorEmbed('Unlink Failed', errorMsg)],
        components: [],
        content: '',
      });
    }
  } catch {
    // Timeout -- remove the select menu
    try {
      await interaction.editReply({ components: [] });
    } catch {
      // Message may have been deleted -- ignore
    }
  }
}
