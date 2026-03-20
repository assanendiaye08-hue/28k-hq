import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Module, ModuleContext } from '../shared/types.js';

/**
 * Dynamically discover and load all modules from src/modules/*\/index.ts.
 *
 * Each module directory must have an index.ts that exports:
 * - A default export that is a Module object, OR
 * - A named export called "module" that is a Module object
 *
 * The module's register() function is called with the shared ModuleContext,
 * allowing it to register commands, event listeners, and scheduled tasks.
 *
 * Missing or empty modules directory is handled gracefully (first run scenario).
 */
export async function loadModules(ctx: ModuleContext): Promise<string[]> {
  const loadedModules: string[] = [];

  // Resolve the modules directory relative to this file
  const currentDir = fileURLToPath(new URL('.', import.meta.url));
  const modulesDir = join(currentDir, '..', 'modules');

  let entries: string[];
  try {
    const dirEntries = await readdir(modulesDir, { withFileTypes: true });
    entries = dirEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    // modules directory doesn't exist yet -- that's fine on first run
    ctx.logger.info('No modules directory found -- skipping module loading');
    return loadedModules;
  }

  if (entries.length === 0) {
    ctx.logger.info('No modules found in modules directory');
    return loadedModules;
  }

  for (const dirName of entries) {
    const modulePath = join(modulesDir, dirName, 'index.js');

    try {
      const imported = await import(modulePath);

      // Support both default and named "module" export
      const mod: Module | undefined = imported.default ?? imported.module;

      if (!mod || typeof mod.register !== 'function') {
        ctx.logger.warn(
          `Module "${dirName}" does not export a valid Module object (needs name + register function)`,
        );
        continue;
      }

      await mod.register(ctx);
      loadedModules.push(mod.name);
      ctx.logger.info(`Loaded module: ${mod.name}`);
    } catch (error) {
      ctx.logger.error(`Failed to load module "${dirName}":`, error);
    }
  }

  ctx.logger.info(`Module loading complete: ${loadedModules.length} module(s) loaded`);
  return loadedModules;
}
