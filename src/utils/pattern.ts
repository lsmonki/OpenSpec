/**
 * Converts a pattern string with {name} placeholder to a regex.
 * The {name} placeholder is replaced with a capture group that matches any text.
 *
 * Special regex characters in the pattern are escaped before conversion.
 *
 * @param pattern - Pattern string like "### Requirement: {name}" or "## RF-{name}:"
 * @returns A RegExp that matches the pattern and captures the name
 *
 * @example
 * patternToRegex("### Requirement: {name}")
 * // Returns: /^### Requirement: (.+)$/
 *
 * @example
 * patternToRegex("## RF-{name}:")
 * // Returns: /^## RF-(.+):$/
 */
export function patternToRegex(pattern: string): RegExp {
  if (!pattern.includes('{name}')) {
    console.warn(`Warning: Pattern "${pattern}" is missing {name} placeholder — matching will not capture names.`);
  }

  // Escape regex special characters except {name}
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, match => {
    // Don't escape the braces in {name}
    if (match === '{' || match === '}') {
      return match;
    }
    return '\\' + match;
  });

  // Replace {name} with a capture group
  const regexPattern = escaped.replace(/\{name\}/g, '(.+)');

  // Create regex that matches from start of line
  return new RegExp(`^${regexPattern}$`, 'm');
}

/**
 * Extracts the name from text using a pattern.
 *
 * @param text - The text to extract from (e.g., "### Requirement: User login")
 * @param pattern - Pattern string with {name} placeholder
 * @returns The extracted name or null if no match
 *
 * @example
 * extractNameFromPattern("### Requirement: User login", "### Requirement: {name}")
 * // Returns: "User login"
 */
export function extractNameFromPattern(text: string, pattern: string): string | null {
  const regex = patternToRegex(pattern);
  const match = text.match(regex);
  return match ? match[1] : null;
}
