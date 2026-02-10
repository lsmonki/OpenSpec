/**
 * Spec Application Logic
 *
 * Extracted from ArchiveCommand to enable standalone spec application.
 * Applies delta specs from a change to main specs without archiving.
 */

import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import {
  extractRequirementsSection,
  parseDeltaSpec,
  normalizeRequirementName,
  type RequirementBlock,
  type RequirementFormatConfig,
} from './parsers/requirement-blocks.js';
import { Validator } from './validation/validator.js';
import { readChangeMetadata } from '../utils/change-metadata.js';
import { resolveSchema } from './artifact-graph/resolver.js';
import { resolveSpecArtifactFiles } from './artifact-graph/schema.js';
import { readProjectConfig } from './project-config.js';
import type { DeltaConfig } from './artifact-graph/types.js';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SpecUpdate {
  source: string;
  target: string;
  exists: boolean;
  /** Whether this file should be delta-merged (true) or direct-copied (false) */
  isDelta?: boolean;
  /** Delta configs for this file (from the matching artifact's deltas[]) */
  fileDeltaConfigs?: Array<{ section: string; pattern: string }>;
}

export interface ApplyResult {
  capability: string;
  added: number;
  modified: number;
  removed: number;
  renamed: number;
}

export interface SpecsApplyOutput {
  changeName: string;
  capabilities: ApplyResult[];
  totals: {
    added: number;
    modified: number;
    removed: number;
    renamed: number;
  };
  noChanges: boolean;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Find all spec files that need to be applied from a change.
 * Discovers all markdown files in each spec folder.
 * Uses specArtifactFiles to determine which files are delta-merge targets.
 * Falls back to spec.md as the only delta target when no config provided.
 */
export async function findSpecUpdates(
  changeDir: string,
  mainSpecsDir: string,
  specArtifactFiles?: Array<{ filename: string; deltas?: Array<{ section: string; pattern: string }> }>,
): Promise<SpecUpdate[]> {
  const updates: SpecUpdate[] = [];
  const changeSpecsDir = path.join(changeDir, 'specs');

  // Build lookup: filename → deltas config (or undefined for direct-copy)
  const defaultFiles = [{ filename: 'spec.md', deltas: [{ section: 'Requirements', pattern: '### Requirement: {name}' }] }];
  const artifactFiles = specArtifactFiles ?? defaultFiles;
  const deltaLookup = new Map<string, Array<{ section: string; pattern: string }> | undefined>();
  for (const af of artifactFiles) {
    deltaLookup.set(af.filename, af.deltas);
  }

  try {
    const entries = await fs.readdir(changeSpecsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const specFolderName = entry.name;
      const changeSpecFolder = path.join(changeSpecsDir, specFolderName);

      try {
        const files = await fs.readdir(changeSpecFolder, { withFileTypes: true });
        for (const file of files) {
          if (!file.isFile() || !file.name.endsWith('.md')) continue;

          const sourceFile = path.join(changeSpecFolder, file.name);
          const targetFile = path.join(mainSpecsDir, specFolderName, file.name);

          let exists = false;
          try {
            await fs.access(targetFile);
            exists = true;
          } catch {
            exists = false;
          }

          const matchedDeltas = deltaLookup.get(file.name);
          updates.push({
            source: sourceFile,
            target: targetFile,
            exists,
            isDelta: matchedDeltas !== undefined && matchedDeltas.length > 0,
            fileDeltaConfigs: matchedDeltas,
          });
        }
      } catch {
        // Spec folder might not be readable, skip
      }
    }
  } catch {
    // No specs directory in change
  }

  return updates;
}

/**
 * Build an updated spec by applying delta operations.
 * Returns the rebuilt content and counts of operations.
 */
export async function buildUpdatedSpec(
  update: SpecUpdate,
  changeName: string,
  config?: RequirementFormatConfig,
  options?: { targetContent?: string; allowEmpty?: boolean }
): Promise<{ rebuilt: string; counts: { added: number; modified: number; removed: number; renamed: number } }> {
  // Read change spec content (delta-format expected)
  const changeContent = await fs.readFile(update.source, 'utf-8');

  // Parse deltas from the change spec file
  const plan = parseDeltaSpec(changeContent, config);
  const specName = path.basename(path.dirname(update.target));

  // Derive block header prefix from config pattern (e.g., "### Requirement: {name}" → "### Requirement: ")
  const patternStr = config?.requirementPattern ?? '### Requirement: {name}';
  const patternPrefix = patternStr.replace('{name}', '');

  // Pre-validate duplicates within sections
  const addedNames = new Set<string>();
  for (const add of plan.added) {
    const name = normalizeRequirementName(add.name);
    if (addedNames.has(name)) {
      throw new Error(
        `${specName} validation failed - duplicate in ADDED for header "${patternPrefix}${add.name}"`
      );
    }
    addedNames.add(name);
  }
  const modifiedNames = new Set<string>();
  for (const mod of plan.modified) {
    const name = normalizeRequirementName(mod.name);
    if (modifiedNames.has(name)) {
      throw new Error(
        `${specName} validation failed - duplicate in MODIFIED for header "${patternPrefix}${mod.name}"`
      );
    }
    modifiedNames.add(name);
  }
  const removedNamesSet = new Set<string>();
  for (const rem of plan.removed) {
    const name = normalizeRequirementName(rem);
    if (removedNamesSet.has(name)) {
      throw new Error(
        `${specName} validation failed - duplicate in REMOVED for header "${patternPrefix}${rem}"`
      );
    }
    removedNamesSet.add(name);
  }
  const renamedFromSet = new Set<string>();
  const renamedToSet = new Set<string>();
  for (const { from, to } of plan.renamed) {
    const fromNorm = normalizeRequirementName(from);
    const toNorm = normalizeRequirementName(to);
    if (renamedFromSet.has(fromNorm)) {
      throw new Error(
        `${specName} validation failed - duplicate FROM in RENAMED for header "${patternPrefix}${from}"`
      );
    }
    if (renamedToSet.has(toNorm)) {
      throw new Error(
        `${specName} validation failed - duplicate TO in RENAMED for header "${patternPrefix}${to}"`
      );
    }
    renamedFromSet.add(fromNorm);
    renamedToSet.add(toNorm);
  }

  // Pre-validate cross-section conflicts
  const conflicts: Array<{ name: string; a: string; b: string }> = [];
  for (const n of modifiedNames) {
    if (removedNamesSet.has(n)) conflicts.push({ name: n, a: 'MODIFIED', b: 'REMOVED' });
    if (addedNames.has(n)) conflicts.push({ name: n, a: 'MODIFIED', b: 'ADDED' });
  }
  for (const n of addedNames) {
    if (removedNamesSet.has(n)) conflicts.push({ name: n, a: 'ADDED', b: 'REMOVED' });
  }
  // Renamed interplay: MODIFIED must reference the NEW header, not FROM
  for (const { from, to } of plan.renamed) {
    const fromNorm = normalizeRequirementName(from);
    const toNorm = normalizeRequirementName(to);
    if (modifiedNames.has(fromNorm)) {
      throw new Error(
        `${specName} validation failed - when a rename exists, MODIFIED must reference the NEW header "${patternPrefix}${to}"`
      );
    }
    // Detect ADDED colliding with a RENAMED TO
    if (addedNames.has(toNorm)) {
      throw new Error(
        `${specName} validation failed - RENAMED TO header collides with ADDED for "${patternPrefix}${to}"`
      );
    }
  }
  if (conflicts.length > 0) {
    const c = conflicts[0];
    throw new Error(
      `${specName} validation failed - present in multiple sections (${c.a} and ${c.b}) for header "${patternPrefix}${c.name}"`
    );
  }
  const hasAnyDelta = plan.added.length + plan.modified.length + plan.removed.length + plan.renamed.length > 0;
  if (!hasAnyDelta) {
    // In multi-delta mode (allowEmpty), return unchanged content when no operations found for this section
    if (options?.allowEmpty) {
      let unchangedContent: string;
      if (options?.targetContent !== undefined) {
        unchangedContent = options.targetContent;
      } else {
        try {
          unchangedContent = await fs.readFile(update.target, 'utf-8');
        } catch {
          unchangedContent = buildSpecSkeleton(specName, changeName);
        }
      }
      return { rebuilt: unchangedContent, counts: { added: 0, modified: 0, removed: 0, renamed: 0 } };
    }
    throw new Error(
      `Delta parsing found no operations for ${path.basename(path.dirname(update.source))}. ` +
        `Provide ADDED/MODIFIED/REMOVED/RENAMED sections in change spec.`
    );
  }

  // Load or create base target content
  let targetContent: string;
  let isNewSpec = false;
  if (options?.targetContent !== undefined) {
    // Use provided content (for multi-delta chaining)
    targetContent = options.targetContent;
  } else {
    try {
      targetContent = await fs.readFile(update.target, 'utf-8');
    } catch {
      // Target spec does not exist; MODIFIED and RENAMED are not allowed for new specs
      // REMOVED will be ignored with a warning since there's nothing to remove
      if (plan.modified.length > 0 || plan.renamed.length > 0) {
        throw new Error(
          `${specName}: target spec does not exist; only ADDED requirements are allowed for new specs. MODIFIED and RENAMED operations require an existing spec.`
        );
      }
      // Warn about REMOVED requirements being ignored for new specs
      if (plan.removed.length > 0) {
        console.log(
          chalk.yellow(
            `⚠️  Warning: ${specName} - ${plan.removed.length} REMOVED requirement(s) ignored for new spec (nothing to remove).`
          )
        );
      }
      isNewSpec = true;
      targetContent = buildSpecSkeleton(specName, changeName);
    }
  }

  // Extract requirements section and build name->block map
  const parts = extractRequirementsSection(targetContent, config);
  const nameToBlock = new Map<string, RequirementBlock>();
  for (const block of parts.bodyBlocks) {
    nameToBlock.set(normalizeRequirementName(block.name), block);
  }

  // Apply operations in order: RENAMED → REMOVED → MODIFIED → ADDED
  // RENAMED
  for (const r of plan.renamed) {
    const from = normalizeRequirementName(r.from);
    const to = normalizeRequirementName(r.to);
    if (!nameToBlock.has(from)) {
      throw new Error(`${specName} RENAMED failed for header "${patternPrefix}${r.from}" - source not found`);
    }
    if (nameToBlock.has(to)) {
      throw new Error(`${specName} RENAMED failed for header "${patternPrefix}${r.to}" - target already exists`);
    }
    const block = nameToBlock.get(from)!;
    const newHeader = `${patternPrefix}${to}`;
    const rawLines = block.raw.split('\n');
    rawLines[0] = newHeader;
    const renamedBlock: RequirementBlock = {
      headerLine: newHeader,
      name: to,
      raw: rawLines.join('\n'),
    };
    nameToBlock.delete(from);
    nameToBlock.set(to, renamedBlock);
  }

  // REMOVED
  for (const name of plan.removed) {
    const key = normalizeRequirementName(name);
    if (!nameToBlock.has(key)) {
      // For new specs, REMOVED requirements are already warned about and ignored
      // For existing specs, missing requirements are an error
      if (!isNewSpec) {
        throw new Error(`${specName} REMOVED failed for header "${patternPrefix}${name}" - not found`);
      }
      // Skip removal for new specs (already warned above)
      continue;
    }
    nameToBlock.delete(key);
  }

  // MODIFIED
  for (const mod of plan.modified) {
    const key = normalizeRequirementName(mod.name);
    if (!nameToBlock.has(key)) {
      throw new Error(`${specName} MODIFIED failed for header "${patternPrefix}${mod.name}" - not found`);
    }
    // Replace block with provided raw (ensure header line matches key)
    const headerLine = mod.raw.split('\n')[0].trim();
    const prefixTrimmed = patternPrefix.trim();
    if (!headerLine.startsWith(prefixTrimmed) || normalizeRequirementName(headerLine.slice(prefixTrimmed.length).trim()) !== key) {
      throw new Error(
        `${specName} MODIFIED failed for header "${patternPrefix}${mod.name}" - header mismatch in content`
      );
    }
    nameToBlock.set(key, mod);
  }

  // ADDED
  for (const add of plan.added) {
    const key = normalizeRequirementName(add.name);
    if (nameToBlock.has(key)) {
      throw new Error(`${specName} ADDED failed for header "${patternPrefix}${add.name}" - already exists`);
    }
    nameToBlock.set(key, add);
  }

  // Duplicates within resulting map are implicitly prevented by key uniqueness.

  // Recompose requirements section preserving original ordering where possible
  const keptOrder: RequirementBlock[] = [];
  const seen = new Set<string>();
  for (const block of parts.bodyBlocks) {
    const key = normalizeRequirementName(block.name);
    const replacement = nameToBlock.get(key);
    if (replacement) {
      keptOrder.push(replacement);
      seen.add(key);
    }
  }
  // Append any newly added that were not in original order
  for (const [key, block] of nameToBlock.entries()) {
    if (!seen.has(key)) {
      keptOrder.push(block);
    }
  }

  const reqBody = [parts.preamble && parts.preamble.trim() ? parts.preamble.trimEnd() : '']
    .filter(Boolean)
    .concat(keptOrder.map((b) => b.raw))
    .join('\n\n')
    .trimEnd();

  const rebuilt = [parts.before.trimEnd(), parts.headerLine, reqBody, parts.after]
    .filter((s, idx) => !(idx === 0 && s === ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  return {
    rebuilt,
    counts: {
      added: plan.added.length,
      modified: plan.modified.length,
      removed: plan.removed.length,
      renamed: plan.renamed.length,
    },
  };
}

/**
 * Write an updated spec to disk.
 */
export async function writeUpdatedSpec(
  update: SpecUpdate,
  rebuilt: string,
  counts: { added: number; modified: number; removed: number; renamed: number }
): Promise<void> {
  // Create target directory if needed
  const targetDir = path.dirname(update.target);
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(update.target, rebuilt);

  const specName = path.basename(path.dirname(update.target));
  console.log(`Applying changes to openspec/specs/${specName}/spec.md:`);
  if (counts.added) console.log(`  + ${counts.added} added`);
  if (counts.modified) console.log(`  ~ ${counts.modified} modified`);
  if (counts.removed) console.log(`  - ${counts.removed} removed`);
  if (counts.renamed) console.log(`  → ${counts.renamed} renamed`);
}

/**
 * Build a skeleton spec for new capabilities.
 */
export function buildSpecSkeleton(specFolderName: string, changeName: string): string {
  const titleBase = specFolderName;
  return `# ${titleBase} Specification\n\n## Purpose\nTBD - created by archiving change ${changeName}. Update Purpose after archive.\n\n## Requirements\n`;
}

/**
 * Apply all delta specs from a change to main specs.
 *
 * @param projectRoot - The project root directory
 * @param changeName - The name of the change to apply
 * @param options - Options for the operation
 * @returns Result of the operation with counts
 */
export async function applySpecs(
  projectRoot: string,
  changeName: string,
  options: {
    dryRun?: boolean;
    skipValidation?: boolean;
    silent?: boolean;
  } = {}
): Promise<SpecsApplyOutput> {
  const changeDir = path.join(projectRoot, 'openspec', 'changes', changeName);
  const mainSpecsDir = path.join(projectRoot, 'openspec', 'specs');

  // Verify change exists
  try {
    const stat = await fs.stat(changeDir);
    if (!stat.isDirectory()) {
      throw new Error(`Change '${changeName}' not found.`);
    }
  } catch {
    throw new Error(`Change '${changeName}' not found.`);
  }

  // Load schema for delta configuration
  let deltaConfigs: DeltaConfig[] = [{ section: 'Requirements', pattern: '### Requirement: {name}' }];
  let validationConfig: import('./validation/validator.js').SpecValidationConfig | undefined;
  try {
    const metadata = readChangeMetadata(changeDir, projectRoot);
    const schemaName = metadata?.schema ?? readProjectConfig(projectRoot)?.schema ?? 'spec-driven';
    const schema = resolveSchema(schemaName, projectRoot);
    const specsArtifact = schema.artifacts.find(a => a.id === 'specs');
    if (specsArtifact?.deltas?.length) {
      deltaConfigs = specsArtifact.deltas;
    }
    // Build validation config from schema
    const firstDelta = specsArtifact?.deltas?.[0];
    validationConfig = {
      requiredSections: specsArtifact?.validations
        ?.filter(v => v.required && !v.scope && !v.eachBlock)
        .map(v => v.pattern.replace(/^## /, '')),
      requirementSection: firstDelta?.section,
      requirementPattern: firstDelta?.pattern,
      deltaConfigs: specsArtifact?.deltas,
      validationRules: specsArtifact?.validations,
      changeScenarioPattern: schema.changeVerify?.scenarioPattern,
      specArtifactFiles: resolveSpecArtifactFiles(schema),
    };
  } catch {
    // If schema loading fails, fall back to defaults
  }

  // Find specs to update
  const specUpdates = await findSpecUpdates(changeDir, mainSpecsDir, validationConfig?.specArtifactFiles);

  if (specUpdates.length === 0) {
    return {
      changeName,
      capabilities: [],
      totals: { added: 0, modified: 0, removed: 0, renamed: 0 },
      noChanges: true,
    };
  }

  // Separate delta-merge files from direct-copy files
  const deltaUpdates = specUpdates.filter(u => u.isDelta !== false);
  const directCopyUpdates = specUpdates.filter(u => u.isDelta === false);

  // Prepare delta-merge updates first (validation pass, no writes)
  const prepared: Array<{
    update: SpecUpdate;
    rebuilt: string;
    counts: { added: number; modified: number; removed: number; renamed: number };
  }> = [];

  for (const update of deltaUpdates) {
    // Use per-file delta configs if available, fall back to top-level deltaConfigs
    const fileDeltaConfigs = update.fileDeltaConfigs ?? deltaConfigs;
    if (fileDeltaConfigs.length <= 1) {
      // Single delta config — pass it directly
      const config: RequirementFormatConfig = {
        sectionName: fileDeltaConfigs[0].section,
        requirementPattern: fileDeltaConfigs[0].pattern,
      };
      const built = await buildUpdatedSpec(update, changeName, config);
      prepared.push({ update, rebuilt: built.rebuilt, counts: built.counts });
    } else {
      // Multi-delta: iterate over configs, chaining rebuilt content
      let currentContent: string | undefined;
      const totalCounts = { added: 0, modified: 0, removed: 0, renamed: 0 };
      for (const dc of fileDeltaConfigs) {
        const config: RequirementFormatConfig = {
          sectionName: dc.section,
          requirementPattern: dc.pattern,
        };
        const built = await buildUpdatedSpec(update, changeName, config, {
          targetContent: currentContent,
          allowEmpty: true,
        });
        currentContent = built.rebuilt;
        totalCounts.added += built.counts.added;
        totalCounts.modified += built.counts.modified;
        totalCounts.removed += built.counts.removed;
        totalCounts.renamed += built.counts.renamed;
      }
      // Ensure at least one section had deltas
      const hasAny = totalCounts.added + totalCounts.modified + totalCounts.removed + totalCounts.renamed > 0;
      if (!hasAny) {
        throw new Error(
          `Delta parsing found no operations for ${path.basename(path.dirname(update.source))}. ` +
            `Provide ADDED/MODIFIED/REMOVED/RENAMED sections in change spec.`
        );
      }
      prepared.push({ update, rebuilt: currentContent!, counts: totalCounts });
    }
  }

  // Validate rebuilt specs unless validation is skipped
  if (!options.skipValidation) {
    const validator = new Validator();
    for (const p of prepared) {
      const specName = path.basename(path.dirname(p.update.target));
      const report = await validator.validateSpecContent(specName, p.rebuilt, validationConfig);
      if (!report.valid) {
        const errors = report.issues
          .filter((i) => i.level === 'ERROR')
          .map((i) => `  ✗ ${i.message}`)
          .join('\n');
        throw new Error(`Validation errors in rebuilt spec for ${specName}:\n${errors}`);
      }
    }
  }

  // Build results
  const capabilities: ApplyResult[] = [];
  const totals = { added: 0, modified: 0, removed: 0, renamed: 0 };

  // Apply delta-merge files
  for (const p of prepared) {
    const capability = path.basename(path.dirname(p.update.target));
    const fileName = path.basename(p.update.target);

    if (!options.dryRun) {
      const targetDir = path.dirname(p.update.target);
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(p.update.target, p.rebuilt);

      if (!options.silent) {
        console.log(`Applying changes to openspec/specs/${capability}/${fileName}:`);
        if (p.counts.added) console.log(`  + ${p.counts.added} added`);
        if (p.counts.modified) console.log(`  ~ ${p.counts.modified} modified`);
        if (p.counts.removed) console.log(`  - ${p.counts.removed} removed`);
        if (p.counts.renamed) console.log(`  → ${p.counts.renamed} renamed`);
      }
    } else if (!options.silent) {
      console.log(`Would apply changes to openspec/specs/${capability}/${fileName}:`);
      if (p.counts.added) console.log(`  + ${p.counts.added} added`);
      if (p.counts.modified) console.log(`  ~ ${p.counts.modified} modified`);
      if (p.counts.removed) console.log(`  - ${p.counts.removed} removed`);
      if (p.counts.renamed) console.log(`  → ${p.counts.renamed} renamed`);
    }

    capabilities.push({
      capability,
      ...p.counts,
    });

    totals.added += p.counts.added;
    totals.modified += p.counts.modified;
    totals.removed += p.counts.removed;
    totals.renamed += p.counts.renamed;
  }

  // Apply direct-copy files (non-delta files like verify.md)
  for (const update of directCopyUpdates) {
    const capability = path.basename(path.dirname(update.target));
    const fileName = path.basename(update.target);
    const sourceContent = await fs.readFile(update.source, 'utf-8');

    if (!options.dryRun) {
      const targetDir = path.dirname(update.target);
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(update.target, sourceContent);

      if (!options.silent) {
        console.log(`Copying openspec/specs/${capability}/${fileName}`);
      }
    } else if (!options.silent) {
      console.log(`Would copy openspec/specs/${capability}/${fileName}`);
    }
  }

  return {
    changeName,
    capabilities,
    totals,
    noChanges: false,
  };
}
