import path from 'path';
import type { TextTransformer } from './command-references.js';

/**
 * Represents resolved specs path in three formats for different contexts.
 */
export interface SpecsPaths {
  /** Full OS-native path for file I/O operations */
  absolute: string;
  /** Path relative to project root with OS-native separators (for console output) */
  relative: string;
  /** Path relative to project root with forward slashes (for prompts/LLM instructions) */
  relativePosix: string;
}

/**
 * Default specs path when not configured.
 */
export const DEFAULT_SPECS_PATH = 'openspec/specs';

/**
 * Resolves specs path into three representations for different contexts.
 *
 * - `absolute`: Full OS-native path for file I/O
 * - `relative`: Relative to projectRoot with OS-native separators (for console)
 * - `relativePosix`: Relative to projectRoot with forward slashes (for prompts)
 *
 * Accepts both forward slashes and backslashes in input, normalizing them
 * for cross-platform compatibility.
 *
 * @param projectRoot - Absolute path to project root
 * @param specsPath - Optional relative path from config (default: 'openspec/specs')
 * @returns Object with absolute, relative, and relativePosix paths
 *
 * @example
 * // Unix
 * resolveSpecsPaths('/home/user/project', 'docs/specs')
 * // Returns: { absolute: '/home/user/project/docs/specs', relative: 'docs/specs', relativePosix: 'docs/specs' }
 *
 * @example
 * // Windows
 * resolveSpecsPaths('C:\\Users\\user\\project', 'docs/specs')
 * // Returns: { absolute: 'C:\\Users\\user\\project\\docs\\specs', relative: 'docs\\specs', relativePosix: 'docs/specs' }
 */
export function resolveSpecsPaths(projectRoot: string, specsPath?: string): SpecsPaths {
  // Use default if not provided
  const raw = specsPath ?? DEFAULT_SPECS_PATH;

  // Split on both separators to handle cross-platform input
  const segments = raw.split(/[/\\]/).filter(Boolean);

  return {
    absolute: path.resolve(projectRoot, ...segments),
    relative: path.join(...segments),
    relativePosix: segments.join('/'),
  };
}

/**
 * Creates a transformer that replaces {{specsPath}} placeholders with the configured path.
 *
 * @param specsPath - The specs path to substitute (use relativePosix for LLM prompts)
 * @returns A transformer function
 */
export function createSpecsPathTransformer(specsPath: string): TextTransformer {
  return (text: string) => text.replaceAll('{{specsPath}}', specsPath);
}
