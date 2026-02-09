/**
 * Hooks Command
 *
 * Retrieves resolved lifecycle hooks for a given lifecycle point.
 * Merges schema hooks (if change provided) and config hooks.
 */

import ora from 'ora';
import {
  resolveHooks,
  VALID_LIFECYCLE_POINTS,
  type ResolvedHook,
} from '../../core/artifact-graph/index.js';
import { validateChangeExists } from './shared.js';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface HooksOptions {
  change?: string;
  json?: boolean;
}

export interface HooksOutput {
  lifecyclePoint: string;
  changeName: string | null;
  hooks: ResolvedHook[];
}

// -----------------------------------------------------------------------------
// Command
/**
 * Retrieve and display resolved hooks for a lifecycle point, merging schema and config hooks.
 *
 * @param lifecyclePoint - The lifecycle point to query (must be one of VALID_LIFECYCLE_POINTS).
 * @param options - Command options. If `change` is provided, resolve hooks for that change; if `json` is `true`, print machine-readable JSON instead of human-readable output.
 */

export async function hooksCommand(
  lifecyclePoint: string | undefined,
  options: HooksOptions
): Promise<void> {
  const spinner = ora('Resolving hooks...').start();

  try {
    const projectRoot = process.cwd();

    // Validate lifecycle point
    if (!lifecyclePoint) {
      spinner.stop();
      throw new Error(
        `Missing required argument <lifecycle-point>. Valid points:\n  ${VALID_LIFECYCLE_POINTS.join('\n  ')}`
      );
    }

    const validPoints = new Set<string>(VALID_LIFECYCLE_POINTS);
    if (!validPoints.has(lifecyclePoint)) {
      spinner.stop();
      throw new Error(
        `Invalid lifecycle point: "${lifecyclePoint}". Valid points:\n  ${VALID_LIFECYCLE_POINTS.join('\n  ')}`
      );
    }

    // Resolve change name if provided
    let changeName: string | null = null;
    if (options.change) {
      changeName = await validateChangeExists(options.change, projectRoot);
    }

    const hooks = resolveHooks(projectRoot, changeName, lifecyclePoint);

    spinner.stop();

    const output: HooksOutput = {
      lifecyclePoint,
      changeName,
      hooks,
    };

    if (options.json) {
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    printHooksText(output);
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

/**
 * Prints a human-readable listing of resolved hooks for a lifecycle point to the console.
 *
 * @param output - Contains `lifecyclePoint`, `changeName` (or `null` for project-wide), and `hooks`; prints a header showing the lifecycle point and context, prints "No hooks defined for this lifecycle point." if none, or prints sections labeled "From schema" or "From config" followed by each hook's instruction.
 */
function printHooksText(output: HooksOutput): void {
  const { lifecyclePoint, changeName, hooks } = output;

  const context = changeName ? `change: ${changeName}` : 'project-wide';
  console.log(`## Hooks: ${lifecyclePoint} (${context})`);
  console.log();

  if (hooks.length === 0) {
    console.log('No hooks defined for this lifecycle point.');
    return;
  }

  for (const hook of hooks) {
    const label = hook.source === 'schema' ? 'From schema' : 'From config';
    console.log(`### ${label}`);
    console.log(hook.instruction.trim());
    console.log();
  }
}
