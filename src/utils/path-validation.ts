import path from 'path';
import { readProjectConfig } from '../core/project-config.js';

/**
 * Maximum allowed '..' segments in a configurable path.
 */
export const MAX_PARENT_TRAVERSAL = 3;

/**
 * Platform-aware denylist of protected system directories.
 * Paths resolving into these directories are always rejected.
 */
export const DENIED_PREFIXES: Record<string, string[]> = {
  linux: ['/etc', '/usr', '/bin', '/sbin', '/boot', '/proc', '/sys', '/dev', '/root'],
  darwin: [
    '/System',
    '/Library',
    '/Applications',
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
  ],
  win32: [
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    'C:\\ProgramData',
  ],
};

/**
 * Tracks which field names have already emitted an external path warning.
 * Prevents repeated warnings for the same configurable path within a process.
 */
const warnedFields = new Set<string>();

/**
 * Reset warning state. Exported for testing only.
 */
export function _resetWarnings(): void {
  warnedFields.clear();
}

/**
 * Validates a resolved absolute path against security constraints.
 *
 * Three layers of validation (in order):
 * 1. Parent traversal depth limit (max 3 '..' segments)
 * 2. Platform-aware system directory denylist
 * 3. Project root containment (configurable via allowExternalPaths)
 *
 * Reads `allowExternalPaths` from project config by default.
 * Pass `allowExternal` in options to override (useful for testing).
 *
 * @param resolvedAbsolute - The fully resolved absolute path to validate
 * @param projectRoot - Absolute path to the project root
 * @param options - Validation options
 * @param options.fieldName - Config field name for error messages (e.g., 'specsPath')
 * @param options.rawSegments - Pre-split path segments for '..' counting
 * @param options.allowExternal - Optional override for allowExternalPaths config
 * @throws Error if the path violates any security constraint
 */
export function validateConfigPath(
  resolvedAbsolute: string,
  projectRoot: string,
  options: {
    fieldName: string;
    rawSegments: string[];
    allowExternal?: boolean;
  }
): void {
  // 1. Depth limit
  const dotDotCount = options.rawSegments.filter((s) => s === '..').length;
  if (dotDotCount > MAX_PARENT_TRAVERSAL) {
    throw new Error(
      `${options.fieldName} contains ${dotDotCount} '..' segments, maximum is ${MAX_PARENT_TRAVERSAL}.`
    );
  }

  // 2. System directory denylist
  const platformPrefixes = DENIED_PREFIXES[process.platform] ?? [];
  const isWindows = process.platform === 'win32';

  for (const prefix of platformPrefixes) {
    const normalizedAbsolute = isWindows ? resolvedAbsolute.toLowerCase() : resolvedAbsolute;
    const normalizedPrefix = isWindows ? prefix.toLowerCase() : prefix;

    if (
      normalizedAbsolute === normalizedPrefix ||
      normalizedAbsolute.startsWith(normalizedPrefix + path.sep)
    ) {
      throw new Error(
        `${options.fieldName} resolves to a protected system directory ('${prefix}'). ` +
          `This is not allowed regardless of allowExternalPaths.`
      );
    }
  }

  // 3. Root containment
  const normalizedRoot = path.resolve(projectRoot);
  const isOutside =
    resolvedAbsolute !== normalizedRoot &&
    !resolvedAbsolute.startsWith(normalizedRoot + path.sep);

  if (isOutside) {
    // Determine allowExternal: use override if provided, otherwise read from config
    const allowExternal =
      options.allowExternal !== undefined
        ? options.allowExternal
        : readProjectConfig(projectRoot)?.allowExternalPaths ?? false;

    if (!allowExternal) {
      throw new Error(
        `${options.fieldName} '${options.rawSegments.join('/')}' resolves outside project root. ` +
          `Set 'allowExternalPaths: true' in openspec/config.yaml to allow this.`
      );
    }

    // Warn once per field name
    if (!warnedFields.has(options.fieldName)) {
      console.warn(
        `Warning: ${options.fieldName} resolves to '${resolvedAbsolute}' which is outside the project root.`
      );
      warnedFields.add(options.fieldName);
    }
  }
}
