/**
 * Identity module -- multi-account linking for unified member identity.
 *
 * Provides:
 * - /link: Generate a 6-character code to link another Discord account
 * - /verify: Verify a link code and connect accounts
 * - /unlink: Remove a linked Discord account
 *
 * All linked accounts share the same Member identity -- same profile,
 * same XP, same data. The link flow uses time-limited codes (5 minutes)
 * with atomic verification to prevent race conditions.
 */

import { SlashCommandBuilder } from 'discord.js';
import type { Module, ModuleContext } from '../../shared/types.js';
import { linkCommand, verifyCommand, unlinkCommand } from './commands.js';

const identityModule: Module = {
  name: 'identity',

  register(ctx: ModuleContext): void {
    // Register /link command
    const linkBuilder = new SlashCommandBuilder()
      .setName('link')
      .setDescription('Generate a code to link another Discord account');

    ctx.commands.register('link', linkBuilder as SlashCommandBuilder, linkCommand);

    // Register /verify command
    const verifyBuilder = new SlashCommandBuilder()
      .setName('verify')
      .setDescription('Verify an account link code')
      .addStringOption((opt) =>
        opt
          .setName('code')
          .setDescription('The 6-character link code')
          .setRequired(true),
      );

    ctx.commands.register('verify', verifyBuilder as SlashCommandBuilder, verifyCommand);

    // Register /unlink command
    const unlinkBuilder = new SlashCommandBuilder()
      .setName('unlink')
      .setDescription('Unlink a Discord account from your identity');

    ctx.commands.register('unlink', unlinkBuilder as SlashCommandBuilder, unlinkCommand);

    ctx.logger.info('Identity module registered');
  },
};

export default identityModule;
