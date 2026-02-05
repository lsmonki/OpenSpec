import { patternToRegex } from '../../utils/pattern.js';

export interface RequirementBlock {
  headerLine: string; // e.g., '### Requirement: Something'
  name: string; // e.g., 'Something'
  raw: string; // full block including headerLine and following content
}

export interface RequirementsSectionParts {
  before: string;
  headerLine: string; // the '## Requirements' line
  preamble: string; // content between headerLine and first requirement block
  bodyBlocks: RequirementBlock[]; // parsed requirement blocks in order
  after: string;
}

/**
 * Configuration for requirement parsing format.
 */
export interface RequirementFormatConfig {
  /** Name of the requirements section (default: 'Requirements') */
  sectionName?: string;
  /** Pattern to identify requirement headers (default: '### Requirement: {name}') */
  requirementPattern?: string;
}

const DEFAULT_REQUIREMENT_PATTERN = '### Requirement: {name}';
const DEFAULT_SECTION_NAME = 'Requirements';

export function normalizeRequirementName(name: string): string {
  return name.trim();
}

/**
 * Builds a regex for matching requirement headers based on the pattern.
 */
function buildRequirementRegex(pattern: string): RegExp {
  return patternToRegex(pattern);
}

/**
 * Builds a regex for checking if a line starts with a requirement header prefix.
 * Used for detecting requirement blocks without capturing the name.
 */
function buildRequirementPrefixRegex(pattern: string): RegExp {
  // Extract the prefix before {name}
  const prefixEnd = pattern.indexOf('{name}');
  if (prefixEnd === -1) {
    throw new Error(`Pattern must include {name} placeholder: ${pattern}`);
  }
  const prefix = pattern.substring(0, prefixEnd);
  // Escape regex special characters
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}`);
}

const REQUIREMENT_HEADER_REGEX = /^###\s*Requirement:\s*(.+)\s*$/;

/**
 * Extracts the Requirements section from a spec file and parses requirement blocks.
 */
export function extractRequirementsSection(
  content: string,
  config?: RequirementFormatConfig
): RequirementsSectionParts {
  const sectionName = config?.sectionName ?? DEFAULT_SECTION_NAME;
  const reqPattern = config?.requirementPattern ?? DEFAULT_REQUIREMENT_PATTERN;

  const normalized = normalizeLineEndings(content);
  const lines = normalized.split('\n');

  // Build regex for section header
  const sectionHeaderRegex = new RegExp(`^##\\s+${escapeRegex(sectionName)}\\s*$`, 'i');
  const reqHeaderIndex = lines.findIndex(l => sectionHeaderRegex.test(l));

  if (reqHeaderIndex === -1) {
    // No requirements section; create an empty one at the end
    const before = content.trimEnd();
    const headerLine = `## ${sectionName}`;
    return {
      before: before ? before + '\n\n' : '',
      headerLine,
      preamble: '',
      bodyBlocks: [],
      after: '\n',
    };
  }

  // Find end of this section: next line that starts with '## ' at same or higher level
  let endIndex = lines.length;
  for (let i = reqHeaderIndex + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      endIndex = i;
      break;
    }
  }

  const before = lines.slice(0, reqHeaderIndex).join('\n');
  const headerLine = lines[reqHeaderIndex];
  const sectionBodyLines = lines.slice(reqHeaderIndex + 1, endIndex);

  // Build regex for requirement headers
  const reqHeaderRegex = buildRequirementRegex(reqPattern);
  const reqPrefixRegex = buildRequirementPrefixRegex(reqPattern);

  // Parse requirement blocks within section body
  const blocks: RequirementBlock[] = [];
  let cursor = 0;
  let preambleLines: string[] = [];

  // Collect preamble lines until first requirement header
  while (cursor < sectionBodyLines.length && !reqPrefixRegex.test(sectionBodyLines[cursor])) {
    preambleLines.push(sectionBodyLines[cursor]);
    cursor++;
  }

  while (cursor < sectionBodyLines.length) {
    const headerLineCandidate = sectionBodyLines[cursor];
    const headerMatch = headerLineCandidate.match(reqHeaderRegex);
    if (!headerMatch) {
      // Not a requirement header; skip line defensively
      cursor++;
      continue;
    }
    const name = normalizeRequirementName(headerMatch[1]);
    cursor++;
    // Gather lines until next requirement header or end of section
    const bodyLines: string[] = [headerLineCandidate];
    while (
      cursor < sectionBodyLines.length &&
      !reqPrefixRegex.test(sectionBodyLines[cursor]) &&
      !/^##\s+/.test(sectionBodyLines[cursor])
    ) {
      bodyLines.push(sectionBodyLines[cursor]);
      cursor++;
    }
    const raw = bodyLines.join('\n').trimEnd();
    blocks.push({ headerLine: headerLineCandidate, name, raw });
  }

  const after = lines.slice(endIndex).join('\n');
  const preamble = preambleLines.join('\n').trimEnd();

  return {
    before: before.trimEnd() ? before + '\n' : before,
    headerLine,
    preamble,
    bodyBlocks: blocks,
    after: after.startsWith('\n') ? after : '\n' + after,
  };
}

/**
 * Escapes regex special characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface DeltaPlan {
  added: RequirementBlock[];
  modified: RequirementBlock[];
  removed: string[]; // requirement names
  renamed: Array<{ from: string; to: string }>;
  sectionPresence: {
    added: boolean;
    modified: boolean;
    removed: boolean;
    renamed: boolean;
  };
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n?/g, '\n');
}

/**
 * Parse a delta-formatted spec change file content into a DeltaPlan with raw blocks.
 * @param content The delta spec content
 * @param config Optional format configuration
 */
export function parseDeltaSpec(content: string, config?: RequirementFormatConfig): DeltaPlan {
  const sectionName = config?.sectionName ?? DEFAULT_SECTION_NAME;
  const reqPattern = config?.requirementPattern ?? DEFAULT_REQUIREMENT_PATTERN;

  const normalized = normalizeLineEndings(content);
  const sections = splitTopLevelSections(normalized);

  // Build delta section names from the configured section name
  const addedLookup = getSectionCaseInsensitive(sections, `ADDED ${sectionName}`);
  const modifiedLookup = getSectionCaseInsensitive(sections, `MODIFIED ${sectionName}`);
  const removedLookup = getSectionCaseInsensitive(sections, `REMOVED ${sectionName}`);
  const renamedLookup = getSectionCaseInsensitive(sections, `RENAMED ${sectionName}`);

  const added = parseRequirementBlocksFromSection(addedLookup.body, reqPattern);
  const modified = parseRequirementBlocksFromSection(modifiedLookup.body, reqPattern);
  const removedNames = parseRemovedNames(removedLookup.body, reqPattern);
  const renamedPairs = parseRenamedPairs(renamedLookup.body, reqPattern);

  return {
    added,
    modified,
    removed: removedNames,
    renamed: renamedPairs,
    sectionPresence: {
      added: addedLookup.found,
      modified: modifiedLookup.found,
      removed: removedLookup.found,
      renamed: renamedLookup.found,
    },
  };
}

function splitTopLevelSections(content: string): Record<string, string> {
  const lines = content.split('\n');
  const result: Record<string, string> = {};
  const indices: Array<{ title: string; index: number; level: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(##)\s+(.+)$/);
    if (m) {
      const level = m[1].length; // only care for '##'
      indices.push({ title: m[2].trim(), index: i, level });
    }
  }
  for (let i = 0; i < indices.length; i++) {
    const current = indices[i];
    const next = indices[i + 1];
    const body = lines.slice(current.index + 1, next ? next.index : lines.length).join('\n');
    result[current.title] = body;
  }
  return result;
}

function getSectionCaseInsensitive(sections: Record<string, string>, desired: string): { body: string; found: boolean } {
  const target = desired.toLowerCase();
  for (const [title, body] of Object.entries(sections)) {
    if (title.toLowerCase() === target) return { body, found: true };
  }
  return { body: '', found: false };
}

function parseRequirementBlocksFromSection(
  sectionBody: string,
  reqPattern: string = DEFAULT_REQUIREMENT_PATTERN
): RequirementBlock[] {
  if (!sectionBody) return [];

  const reqHeaderRegex = buildRequirementRegex(reqPattern);
  const reqPrefixRegex = buildRequirementPrefixRegex(reqPattern);

  const lines = normalizeLineEndings(sectionBody).split('\n');
  const blocks: RequirementBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    // Seek next requirement header
    while (i < lines.length && !reqPrefixRegex.test(lines[i])) i++;
    if (i >= lines.length) break;
    const headerLine = lines[i];
    const m = headerLine.match(reqHeaderRegex);
    if (!m) {
      i++;
      continue;
    }
    const name = normalizeRequirementName(m[1]);
    const buf: string[] = [headerLine];
    i++;
    while (i < lines.length && !reqPrefixRegex.test(lines[i]) && !/^##\s+/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ headerLine, name, raw: buf.join('\n').trimEnd() });
  }
  return blocks;
}

function parseRemovedNames(
  sectionBody: string,
  reqPattern: string = DEFAULT_REQUIREMENT_PATTERN
): string[] {
  if (!sectionBody) return [];

  const reqHeaderRegex = buildRequirementRegex(reqPattern);
  // Build bullet pattern from the configured pattern
  // e.g., "### Requirement: {name}" -> /^\s*-\s*`?### Requirement: (.+?)`?\s*$/
  const patternPrefix = reqPattern.replace('{name}', '');
  const bulletPattern = new RegExp(
    `^\\s*-\\s*\`?${escapeRegex(patternPrefix.trim())}\\s*(.+?)\`?\\s*$`
  );

  const names: string[] = [];
  const lines = normalizeLineEndings(sectionBody).split('\n');
  for (const line of lines) {
    const m = line.match(reqHeaderRegex);
    if (m) {
      names.push(normalizeRequirementName(m[1]));
      continue;
    }
    // Also support bullet list of headers
    const bullet = line.match(bulletPattern);
    if (bullet) {
      names.push(normalizeRequirementName(bullet[1]));
    }
  }
  return names;
}

function parseRenamedPairs(
  sectionBody: string,
  reqPattern: string = DEFAULT_REQUIREMENT_PATTERN
): Array<{ from: string; to: string }> {
  if (!sectionBody) return [];

  // Build FROM/TO patterns from the configured requirement pattern
  // e.g., "### Requirement: {name}" -> FROM: `### Requirement: <name>`
  const patternPrefix = reqPattern.replace('{name}', '');
  const escapedPrefix = escapeRegex(patternPrefix.trim());
  const fromPattern = new RegExp(`^\\s*-?\\s*FROM:\\s*\`?${escapedPrefix}\\s*(.+?)\`?\\s*$`);
  const toPattern = new RegExp(`^\\s*-?\\s*TO:\\s*\`?${escapedPrefix}\\s*(.+?)\`?\\s*$`);

  const pairs: Array<{ from: string; to: string }> = [];
  const lines = normalizeLineEndings(sectionBody).split('\n');
  let current: { from?: string; to?: string } = {};
  for (const line of lines) {
    const fromMatch = line.match(fromPattern);
    const toMatch = line.match(toPattern);
    if (fromMatch) {
      current.from = normalizeRequirementName(fromMatch[1]);
    } else if (toMatch) {
      current.to = normalizeRequirementName(toMatch[1]);
      if (current.from && current.to) {
        pairs.push({ from: current.from, to: current.to });
        current = {};
      }
    }
  }
  return pairs;
}
