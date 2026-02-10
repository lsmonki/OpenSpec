import { ZodError } from 'zod';
import { readFileSync, promises as fs } from 'fs';
import path from 'path';
import { SpecSchema, ChangeSchema, Spec, Change } from '../schemas/index.js';
import { MarkdownParser, SpecFormatConfig } from '../parsers/markdown-parser.js';
import { ChangeParser } from '../parsers/change-parser.js';
import { ValidationReport, ValidationIssue, ValidationLevel } from './types.js';
import {
  MIN_PURPOSE_LENGTH,
  MAX_REQUIREMENT_TEXT_LENGTH,
  VALIDATION_MESSAGES,
} from './constants.js';
import {
  parseDeltaSpec,
  normalizeRequirementName,
  RequirementFormatConfig,
} from '../parsers/requirement-blocks.js';
import { FileSystemUtils } from '../../utils/file-system.js';
import { patternToRegex } from '../../utils/pattern.js';
import type { ValidationRule } from '../artifact-graph/types.js';

/**
 * Configuration for spec validation derived from schema.
 */
export interface SpecValidationConfig {
  /** Required section names (default: ['Purpose', 'Requirements']) */
  requiredSections?: string[];
  /** Name of the section containing requirements (default: 'Requirements') */
  requirementSection?: string;
  /** Pattern to identify requirement headers (default: '### Requirement: {name}') */
  requirementPattern?: string;
  /** Multiple delta configs from schema's deltas[] array.
   *  When provided, validateChangeDeltaSpecs iterates over all entries.
   *  Falls back to requirementSection/requirementPattern if not provided. */
  deltaConfigs?: Array<{ section: string; pattern: string }>;
  /** Validation rules from schema's validations[] array.
   *  Used by validateContentRules for spec structural validation. */
  validationRules?: ValidationRule[];
  /** Scenario pattern from changeVerify (default: '#### Scenario: {name}').
   *  Used by validateChangeDeltaSpecs for change validation. */
  changeScenarioPattern?: string;
  /** Normative keyword pattern from changeVerify (default: 'SHALL|MUST').
   *  null disables the check. Used by validateChangeDeltaSpecs. */
  changeShallMustPattern?: string | null;
  /** Resolved spec artifact files from requiredSpecArtifacts.
   *  Each entry has a filename and optional deltas config.
   *  Default: [{ filename: 'spec.md', deltas: [{ section: 'Requirements', pattern: '### Requirement: {name}' }] }] */
  specArtifactFiles?: Array<{ filename: string; deltas?: Array<{ section: string; pattern: string }> }>;
}

export class Validator {
  private strictMode: boolean;

  constructor(strictMode: boolean = false) {
    this.strictMode = strictMode;
  }

  async validateSpec(filePath: string, config?: SpecValidationConfig): Promise<ValidationReport> {
    const issues: ValidationIssue[] = [];
    const specName = this.extractNameFromPath(filePath);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const parser = new MarkdownParser(content);

      // Convert to parser config format
      const parserConfig: SpecFormatConfig | undefined = config
        ? {
            requiredSections: config.requiredSections,
            requirementSection: config.requirementSection,
          }
        : undefined;

      const spec = parser.parseSpec(specName, parserConfig);

      const result = SpecSchema.safeParse(spec);

      if (!result.success) {
        issues.push(...this.convertZodErrors(result.error));
      }

      issues.push(...this.applySpecRules(spec, content, config));
    } catch (error) {
      const baseMessage = error instanceof Error ? error.message : 'Unknown error';
      const enriched = this.enrichTopLevelError(specName, baseMessage, config);
      issues.push({
        level: 'ERROR',
        path: 'file',
        message: enriched,
      });
    }

    return this.createReport(issues);
  }

  /**
   * Validate spec content from a string (used for pre-write validation of rebuilt specs)
   */
  async validateSpecContent(
    specName: string,
    content: string,
    config?: SpecValidationConfig
  ): Promise<ValidationReport> {
    const issues: ValidationIssue[] = [];
    try {
      const parser = new MarkdownParser(content);

      // Convert to parser config format
      const parserConfig: SpecFormatConfig | undefined = config
        ? {
            requiredSections: config.requiredSections,
            requirementSection: config.requirementSection,
          }
        : undefined;

      const spec = parser.parseSpec(specName, parserConfig);
      const result = SpecSchema.safeParse(spec);
      if (!result.success) {
        issues.push(...this.convertZodErrors(result.error));
      }
      issues.push(...this.applySpecRules(spec, content, config));
    } catch (error) {
      const baseMessage = error instanceof Error ? error.message : 'Unknown error';
      const enriched = this.enrichTopLevelError(specName, baseMessage, config);
      issues.push({ level: 'ERROR', path: 'file', message: enriched });
    }
    return this.createReport(issues);
  }

  async validateChange(filePath: string): Promise<ValidationReport> {
    const issues: ValidationIssue[] = [];
    const changeName = this.extractNameFromPath(filePath);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const changeDir = path.dirname(filePath);
      const parser = new ChangeParser(content, changeDir);
      
      const change = await parser.parseChangeWithDeltas(changeName);
      
      const result = ChangeSchema.safeParse(change);
      
      if (!result.success) {
        issues.push(...this.convertZodErrors(result.error));
      }
      
      issues.push(...this.applyChangeRules(change, content));
      
    } catch (error) {
      const baseMessage = error instanceof Error ? error.message : 'Unknown error';
      const enriched = this.enrichTopLevelError(changeName, baseMessage);
      issues.push({
        level: 'ERROR',
        path: 'file',
        message: enriched,
      });
    }
    
    return this.createReport(issues);
  }

  /**
   * Validate delta-formatted spec files under a change directory.
   * Enforces:
   * - At least one delta across all files
   * - ADDED/MODIFIED: each requirement has SHALL/MUST and at least one scenario
   * - REMOVED: names only; no scenario/description required
   * - RENAMED: pairs well-formed
   * - No duplicates within sections; no cross-section conflicts per spec
   */
  async validateChangeDeltaSpecs(
    changeDir: string,
    config?: SpecValidationConfig
  ): Promise<ValidationReport> {
    const issues: ValidationIssue[] = [];
    const specsDir = path.join(changeDir, 'specs');
    let totalDeltas = 0;
    const missingHeaderSpecs: string[] = [];
    const emptySectionSpecs: Array<{ path: string; sections: string[] }> = [];

    // Change validation patterns from changeVerify (via bridge).
    // Defaults preserve backward compatibility.
    const scenarioPattern = config?.changeScenarioPattern ?? '#### Scenario: {name}';
    const shallMustPattern: string | null = config?.changeShallMustPattern === undefined
      ? 'SHALL|MUST' : config.changeShallMustPattern;

    // Resolve artifact files to validate.
    // When specArtifactFiles is not provided, build default from legacy config fields.
    const artifactFiles = config?.specArtifactFiles ?? [{
      filename: 'spec.md',
      deltas: config?.deltaConfigs?.length
        ? config.deltaConfigs
        : [{ section: config?.requirementSection ?? 'Requirements', pattern: config?.requirementPattern ?? '### Requirement: {name}' }],
    }];

    // Build the combined delta configs list for error messages
    const deltaConfigsList: Array<{ section: string; pattern: string }> = [];
    for (const af of artifactFiles) {
      if (af.deltas) deltaConfigsList.push(...af.deltas);
    }
    if (deltaConfigsList.length === 0) {
      deltaConfigsList.push({
        section: config?.requirementSection ?? 'Requirements',
        pattern: config?.requirementPattern ?? '### Requirement: {name}',
      });
    }

    try {
      const entries = await fs.readdir(specsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const specName = entry.name;

        // Iterate over all artifact files (not just spec.md)
        for (const artifactFile of artifactFiles) {
          if (!artifactFile.deltas?.length) continue; // skip non-delta artifacts

        const specFile = path.join(specsDir, specName, artifactFile.filename);
        let content: string | undefined;
        try {
          content = await fs.readFile(specFile, 'utf-8');
        } catch {
          continue;
        }

        const entryPath = `${specName}/${artifactFile.filename}`;
        let hasAnyEntries = false;
        const allSectionNames: string[] = [];

        // Iterate over all delta configs for this artifact
        for (const dc of artifactFile.deltas) {
          const deltaConfig: RequirementFormatConfig = {
            sectionName: dc.section,
            requirementPattern: dc.pattern,
          };
          const deltaSectionNames = {
            added: `ADDED ${dc.section}`,
            modified: `MODIFIED ${dc.section}`,
            removed: `REMOVED ${dc.section}`,
            renamed: `RENAMED ${dc.section}`,
          };

          const plan = parseDeltaSpec(content, deltaConfig);
          if (plan.sectionPresence.added) allSectionNames.push(`## ${deltaSectionNames.added}`);
          if (plan.sectionPresence.modified) allSectionNames.push(`## ${deltaSectionNames.modified}`);
          if (plan.sectionPresence.removed) allSectionNames.push(`## ${deltaSectionNames.removed}`);
          if (plan.sectionPresence.renamed) allSectionNames.push(`## ${deltaSectionNames.renamed}`);
          const hasEntries =
            plan.added.length + plan.modified.length + plan.removed.length + plan.renamed.length > 0;
          if (hasEntries) hasAnyEntries = true;

          const addedNames = new Set<string>();
          const modifiedNames = new Set<string>();
          const removedNames = new Set<string>();
          const renamedFrom = new Set<string>();
          const renamedTo = new Set<string>();

          // Validate ADDED
          for (const block of plan.added) {
            const key = normalizeRequirementName(block.name);
            totalDeltas++;
            if (addedNames.has(key)) {
              issues.push({
                level: 'ERROR',
                path: entryPath,
                message: `Duplicate requirement in ADDED ${dc.section}: "${block.name}"`,
              });
            } else {
              addedNames.add(key);
            }
            const requirementText = this.extractRequirementText(block.raw, dc.pattern);
            if (!requirementText) {
              issues.push({
                level: 'ERROR',
                path: entryPath,
                message: `ADDED "${block.name}" is missing requirement text`,
              });
            } else if (shallMustPattern && !this.matchesNormativePattern(requirementText, shallMustPattern)) {
              issues.push({
                level: 'ERROR',
                path: entryPath,
                message: `ADDED "${block.name}" must match normative pattern: ${shallMustPattern}`,
              });
            }
            const addedScenarioCount = this.countScenarios(block.raw, scenarioPattern);
            if (addedScenarioCount < 1) {
              issues.push({
                level: 'ERROR',
                path: entryPath,
                message: `ADDED "${block.name}" must include at least one scenario`,
              });
            }
          }

          // Validate MODIFIED
          for (const block of plan.modified) {
            const key = normalizeRequirementName(block.name);
            totalDeltas++;
            if (modifiedNames.has(key)) {
              issues.push({
                level: 'ERROR',
                path: entryPath,
                message: `Duplicate requirement in MODIFIED ${dc.section}: "${block.name}"`,
              });
            } else {
              modifiedNames.add(key);
            }
            const requirementText = this.extractRequirementText(block.raw, dc.pattern);
            if (!requirementText) {
              issues.push({
                level: 'ERROR',
                path: entryPath,
                message: `MODIFIED "${block.name}" is missing requirement text`,
              });
            } else if (shallMustPattern && !this.matchesNormativePattern(requirementText, shallMustPattern)) {
              issues.push({
                level: 'ERROR',
                path: entryPath,
                message: `MODIFIED "${block.name}" must match normative pattern: ${shallMustPattern}`,
              });
            }
            const modifiedScenarioCount = this.countScenarios(block.raw, scenarioPattern);
            if (modifiedScenarioCount < 1) {
              issues.push({
                level: 'ERROR',
                path: entryPath,
                message: `MODIFIED "${block.name}" must include at least one scenario`,
              });
            }
          }

          // Validate REMOVED (names only)
          for (const name of plan.removed) {
            const key = normalizeRequirementName(name);
            totalDeltas++;
            if (removedNames.has(key)) {
              issues.push({
                level: 'ERROR',
                path: entryPath,
                message: `Duplicate requirement in REMOVED ${dc.section}: "${name}"`,
              });
            } else {
              removedNames.add(key);
            }
          }

          // Validate RENAMED pairs
          for (const { from, to } of plan.renamed) {
            const fromKey = normalizeRequirementName(from);
            const toKey = normalizeRequirementName(to);
            totalDeltas++;
            if (renamedFrom.has(fromKey)) {
              issues.push({
                level: 'ERROR',
                path: entryPath,
                message: `Duplicate FROM in RENAMED ${dc.section}: "${from}"`,
              });
            } else {
              renamedFrom.add(fromKey);
            }
            if (renamedTo.has(toKey)) {
              issues.push({
                level: 'ERROR',
                path: entryPath,
                message: `Duplicate TO in RENAMED ${dc.section}: "${to}"`,
              });
            } else {
              renamedTo.add(toKey);
            }
          }

          // Cross-section conflicts (within the same delta section)
          for (const n of modifiedNames) {
            if (removedNames.has(n)) {
              issues.push({
                level: 'ERROR',
                path: entryPath,
                message: `Requirement present in both MODIFIED and REMOVED: "${n}"`,
              });
            }
            if (addedNames.has(n)) {
              issues.push({
                level: 'ERROR',
                path: entryPath,
                message: `Requirement present in both MODIFIED and ADDED: "${n}"`,
              });
            }
          }
          for (const n of addedNames) {
            if (removedNames.has(n)) {
              issues.push({
                level: 'ERROR',
                path: entryPath,
                message: `Requirement present in both ADDED and REMOVED: "${n}"`,
              });
            }
          }
          for (const { from, to } of plan.renamed) {
            const fromKey = normalizeRequirementName(from);
            const toKey = normalizeRequirementName(to);
            if (modifiedNames.has(fromKey)) {
              issues.push({
                level: 'ERROR',
                path: entryPath,
                message: `MODIFIED references old name from RENAMED. Use new header for "${to}"`,
              });
            }
            if (addedNames.has(toKey)) {
              issues.push({
                level: 'ERROR',
                path: entryPath,
                message: `RENAMED TO collides with ADDED for "${to}"`,
              });
            }
          }
        }

        if (!hasAnyEntries) {
          if (allSectionNames.length > 0) emptySectionSpecs.push({ path: entryPath, sections: allSectionNames });
          else missingHeaderSpecs.push(entryPath);
        }
        } // end artifact file loop
      }
    } catch {
      // If no specs dir, treat as no deltas
    }

    // Build pattern prefixes for error messages
    const patternPrefixes = deltaConfigsList.map(dc => dc.pattern.replace('{name}', '')).join('" or "');
    const exampleHeaders = deltaConfigsList.map(dc => `"## ADDED ${dc.section}"`).join(' or ');

    for (const { path: specPath, sections } of emptySectionSpecs) {
      issues.push({
        level: 'ERROR',
        path: specPath,
        message: `Delta sections ${this.formatSectionList(sections)} were found, but no requirement entries parsed. Ensure each section includes at least one "${patternPrefixes}" block (REMOVED may use bullet list syntax).`,
      });
    }
    for (const specPath of missingHeaderSpecs) {
      issues.push({
        level: 'ERROR',
        path: specPath,
        message: `No delta sections found. Add headers such as ${exampleHeaders} or move non-delta notes outside specs/.`,
      });
    }

    if (totalDeltas === 0) {
      issues.push({
        level: 'ERROR',
        path: 'file',
        message: this.enrichTopLevelError('change', VALIDATION_MESSAGES.CHANGE_NO_DELTAS, config),
      });
    }

    return this.createReport(issues);
  }

  private convertZodErrors(error: ZodError): ValidationIssue[] {
    return error.issues.map(err => {
      let message = err.message;
      if (message === VALIDATION_MESSAGES.CHANGE_NO_DELTAS) {
        message = `${message}. ${VALIDATION_MESSAGES.GUIDE_NO_DELTAS}`;
      }
      return {
        level: 'ERROR' as ValidationLevel,
        path: err.path.join('.'),
        message,
      };
    });
  }

  private applySpecRules(
    spec: Spec,
    content: string,
    config?: SpecValidationConfig
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Structural validation via generic rules engine (validations[] from schema)
    // This is the single source of truth for scenarios, normative keywords, etc.
    if (config?.validationRules && config.validationRules.length > 0) {
      issues.push(...this.validateContentRules(content, config.validationRules, spec.name || 'spec'));
    }

    if (spec.overview.length < MIN_PURPOSE_LENGTH) {
      issues.push({
        level: 'WARNING',
        path: 'overview',
        message: VALIDATION_MESSAGES.PURPOSE_TOO_BRIEF,
      });
    }

    spec.requirements.forEach((req, index) => {
      if (req.text.length > MAX_REQUIREMENT_TEXT_LENGTH) {
        issues.push({
          level: 'INFO',
          path: `requirements[${index}]`,
          message: VALIDATION_MESSAGES.REQUIREMENT_TOO_LONG,
        });
      }
    });

    return issues;
  }

  private applyChangeRules(change: Change, content: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    
    const MIN_DELTA_DESCRIPTION_LENGTH = 10;
    
    change.deltas.forEach((delta, index) => {
      if (!delta.description || delta.description.length < MIN_DELTA_DESCRIPTION_LENGTH) {
        issues.push({
          level: 'WARNING',
          path: `deltas[${index}].description`,
          message: VALIDATION_MESSAGES.DELTA_DESCRIPTION_TOO_BRIEF,
        });
      }
      
      if ((delta.operation === 'ADDED' || delta.operation === 'MODIFIED') && 
          (!delta.requirements || delta.requirements.length === 0)) {
        issues.push({
          level: 'WARNING',
          path: `deltas[${index}].requirements`,
          message: `${delta.operation} ${VALIDATION_MESSAGES.DELTA_MISSING_REQUIREMENTS}`,
        });
      }
    });
    
    return issues;
  }

  private enrichTopLevelError(
    itemId: string,
    baseMessage: string,
    config?: SpecValidationConfig
  ): string {
    const msg = baseMessage.trim();
    const sectionName = config?.requirementSection ?? 'Requirements';

    if (msg === VALIDATION_MESSAGES.CHANGE_NO_DELTAS) {
      // Use configured section names in guidance (support multiple delta configs)
      const deltaConfigsList = config?.deltaConfigs?.length
        ? config.deltaConfigs
        : [{ section: sectionName, pattern: config?.requirementPattern ?? '### Requirement: {name}' }];
      const allHeaders = deltaConfigsList.flatMap(dc => [
        `## ADDED ${dc.section}`, `## MODIFIED ${dc.section}`,
        `## REMOVED ${dc.section}`, `## RENAMED ${dc.section}`,
      ]);
      return `${msg}. Change specs must include ${allHeaders.join(', ')}. Files must live under openspec/changes/{id}/specs/<capability>/spec.md.`;
    }
    if (msg.includes('Spec must have a') && msg.includes('section')) {
      // Dynamic section name in message
      const requiredSections = config?.requiredSections ?? ['Purpose', 'Requirements'];
      const sectionList = requiredSections.map(s => `## ${s}`).join(', ');
      return `${msg}. Spec files must include: ${sectionList}`;
    }
    if (
      msg.includes('Change must have a Why section') ||
      msg.includes('Change must have a What Changes section')
    ) {
      return `${msg}. ${VALIDATION_MESSAGES.GUIDE_MISSING_CHANGE_SECTIONS}`;
    }
    return msg;
  }

  private extractNameFromPath(filePath: string): string {
    const normalizedPath = FileSystemUtils.toPosixPath(filePath);
    const parts = normalizedPath.split('/');
    
    // Look for the directory name after 'specs' or 'changes'
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] === 'specs' || parts[i] === 'changes') {
        if (i < parts.length - 1) {
          return parts[i + 1];
        }
      }
    }
    
    // Fallback to filename without extension if not in expected structure
    const fileName = parts[parts.length - 1] ?? '';
    const dotIndex = fileName.lastIndexOf('.');
    return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  }

  private createReport(issues: ValidationIssue[]): ValidationReport {
    const errors = issues.filter(i => i.level === 'ERROR').length;
    const warnings = issues.filter(i => i.level === 'WARNING').length;
    const info = issues.filter(i => i.level === 'INFO').length;
    
    const valid = this.strictMode 
      ? errors === 0 && warnings === 0
      : errors === 0;
    
    return {
      valid,
      issues,
      summary: {
        errors,
        warnings,
        info,
      },
    };
  }

  isValid(report: ValidationReport): boolean {
    return report.valid;
  }

  private extractRequirementText(
    blockRaw: string,
    _reqPattern?: string
  ): string | undefined {
    const lines = blockRaw.split('\n');
    // Skip header line (index 0)
    let i = 1;

    // Find the first substantial text line, skipping metadata and blank lines
    for (; i < lines.length; i++) {
      const line = lines[i];

      // Stop at any header (scenario or other)
      if (/^#{1,6}\s+/.test(line)) break;

      const trimmed = line.trim();

      // Skip blank lines
      if (trimmed.length === 0) continue;

      // Skip metadata lines (lines starting with ** like **ID**, **Priority**, etc.)
      if (/^\*\*[^*]+\*\*:/.test(trimmed)) continue;

      // Found first non-metadata, non-blank line - this is the requirement text
      return trimmed;
    }

    // No requirement text found
    return undefined;
  }

  /**
   * Check if text matches the normative keyword pattern.
   * The pattern is a JavaScript RegExp string (e.g., "SHALL|MUST" or "[Ss]hall|[Mm]ust").
   */
  private matchesNormativePattern(text: string, pattern: string): boolean {
    try {
      const regex = new RegExp(`\\b(${pattern})\\b`);
      return regex.test(text);
    } catch {
      // If pattern is invalid regex, fall back to simple includes
      return text.includes(pattern);
    }
  }

  private countScenarios(blockRaw: string, scenarioPattern?: string): number {
    if (scenarioPattern) {
      // Build prefix regex from pattern (e.g., "#### Scenario: {name}" -> /^#### Scenario: /gm)
      const prefixEnd = scenarioPattern.indexOf('{name}');
      if (prefixEnd !== -1) {
        const prefix = scenarioPattern.substring(0, prefixEnd);
        const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const prefixRegex = new RegExp(`^${escapedPrefix}`, 'gm');
        const matches = blockRaw.match(prefixRegex);
        return matches ? matches.length : 0;
      }
    }
    // Default: count any level 4 headers
    const matches = blockRaw.match(/^####\s+/gm);
    return matches ? matches.length : 0;
  }

  private formatSectionList(sections: string[]): string {
    if (sections.length === 0) return '';
    if (sections.length === 1) return sections[0];
    const head = sections.slice(0, -1);
    const last = sections[sections.length - 1];
    return `${head.join(', ')} and ${last}`;
  }

  /**
   * Cross-file verification: check that every requirement in specContent
   * has at least one verification block (scenario) in verifyContent.
   *
   * @param specContent - Content of the spec file (requirements)
   * @param verifyContent - Content of the verification file (scenarios)
   * @param patterns - Patterns for requirement and scenario headers
   * @param filePath - Path for error reporting
   */
  crossFileVerify(
    specContent: string,
    verifyContent: string,
    patterns: { requirementPattern?: string; scenarioPattern?: string },
    filePath: string
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const reqPattern = patterns.requirementPattern ?? '### Requirement: {name}';
    const scenarioPattern = patterns.scenarioPattern ?? '#### Scenario: {name}';

    // Extract requirement names from spec content
    const reqRegex = patternToRegex(reqPattern);
    const requirementNames: string[] = [];
    for (const line of specContent.split('\n')) {
      const match = line.match(reqRegex);
      if (match) {
        requirementNames.push(normalizeRequirementName(match[1]));
      }
    }

    if (requirementNames.length === 0) return issues;

    // Extract scenario names from verify content
    const scenarioRegex = patternToRegex(scenarioPattern);
    const scenarioNames = new Set<string>();
    for (const line of verifyContent.split('\n')) {
      const match = line.match(scenarioRegex);
      if (match) {
        scenarioNames.add(match[1].trim());
      }
    }

    // Check each requirement has at least one related scenario
    // We do a loose match: scenario name should reference the requirement name
    for (const reqName of requirementNames) {
      const reqLower = reqName.toLowerCase();
      const hasScenario = [...scenarioNames].some(s =>
        s.toLowerCase().includes(reqLower) || reqLower.includes(s.toLowerCase())
      );
      // Also check if any scenario text just exists (lenient - at least one scenario per file)
      if (!hasScenario && scenarioNames.size === 0) {
        issues.push({
          level: 'ERROR',
          path: filePath,
          message: `No verification scenarios found for requirement "${reqName}". The verification file should contain at least one "${scenarioPattern.replace('{name}', '')}" block.`,
        });
      }
    }

    return issues;
  }

  /**
   * Validate content against a `validations[]` array from the schema.
   * Supports three granularity levels:
   * - File-level (no scope/eachBlock): pattern must exist somewhere in content
   * - Scope-level (scope: "X"): pattern must exist within ## X section
   * - eachBlock-level (eachBlock: "X"): pattern must exist in each ### block within ## X section
   */
  validateContentRules(
    content: string,
    rules: ValidationRule[],
    filePath: string
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const rule of rules) {
      const level: ValidationLevel = rule.required ? 'ERROR' : 'WARNING';

      if (rule.eachBlock) {
        // eachBlock-level: check pattern in each ### block within ## section
        const sectionContent = extractSectionContent(content, rule.eachBlock);
        if (sectionContent === undefined) {
          issues.push({
            level,
            path: filePath,
            message: `Section "## ${rule.eachBlock}" not found (needed for eachBlock validation of "${rule.pattern}")`,
          });
          continue;
        }
        const blocks = splitIntoBlocks(sectionContent);
        if (blocks.length === 0) {
          issues.push({
            level: 'WARNING',
            path: filePath,
            message: `No ### blocks found in "## ${rule.eachBlock}" to validate pattern "${rule.pattern}"`,
          });
          continue;
        }
        for (const block of blocks) {
          if (!matchesPattern(block.content, rule.pattern)) {
            issues.push({
              level,
              path: filePath,
              message: `Block "${block.name}" in "## ${rule.eachBlock}" is missing ${rule.required ? 'required' : 'recommended'} pattern: ${rule.pattern}`,
            });
          }
        }
      } else if (rule.scope) {
        // Scope-level: check pattern within ## section
        const sectionContent = extractSectionContent(content, rule.scope);
        if (sectionContent === undefined) {
          issues.push({
            level,
            path: filePath,
            message: `Section "## ${rule.scope}" not found (needed for scope validation of "${rule.pattern}")`,
          });
          continue;
        }
        if (!matchesPattern(sectionContent, rule.pattern)) {
          issues.push({
            level,
            path: filePath,
            message: `Section "## ${rule.scope}" is missing ${rule.required ? 'required' : 'recommended'} pattern: ${rule.pattern}`,
          });
        }
      } else {
        // File-level: check pattern anywhere in content
        if (!matchesPattern(content, rule.pattern)) {
          issues.push({
            level,
            path: filePath,
            message: `File is missing ${rule.required ? 'required' : 'recommended'} pattern: ${rule.pattern}`,
          });
        }
      }
    }

    return issues;
  }
}

/**
 * Extract the content of a ## section by name.
 * Returns the text between the ## header and the next ## header (or end of file).
 * Returns undefined if section not found.
 */
export function extractSectionContent(content: string, sectionName: string): string | undefined {
  const lines = content.split('\n');
  const headerRegex = new RegExp(`^##\\s+${escapeRegexChars(sectionName)}\\s*$`, 'i');

  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerRegex.test(lines[i])) {
      startIdx = i + 1;
      break;
    }
  }

  if (startIdx === -1) return undefined;

  let endIdx = lines.length;
  for (let i = startIdx; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }

  return lines.slice(startIdx, endIdx).join('\n');
}

/**
 * Split section content into ### blocks.
 * Each block has a name (from the ### header) and content (including the header).
 */
export function splitIntoBlocks(sectionContent: string): Array<{ name: string; content: string }> {
  const lines = sectionContent.split('\n');
  const blocks: Array<{ name: string; content: string }> = [];
  let currentName: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^###\s+(.+)$/);
    if (headerMatch) {
      if (currentName !== null) {
        blocks.push({ name: currentName, content: currentLines.join('\n') });
      }
      currentName = headerMatch[1].trim();
      currentLines = [line];
    } else if (currentName !== null) {
      currentLines.push(line);
    }
  }

  if (currentName !== null) {
    blocks.push({ name: currentName, content: currentLines.join('\n') });
  }

  return blocks;
}

/**
 * Check if content matches a pattern string.
 * Patterns can be:
 * - A regex pattern like "SHALL|MUST"
 * - A pattern with {name} placeholder like "### Requirement: {name}"
 * - A literal section header like "## Purpose"
 */
function matchesPattern(content: string, pattern: string): boolean {
  if (pattern.includes('{name}')) {
    // Pattern with placeholder - use patternToRegex
    const regex = patternToRegex(pattern);
    return regex.test(content);
  }
  // Try as regex first (for patterns like "SHALL|MUST")
  try {
    const regex = new RegExp(pattern, 'm');
    return regex.test(content);
  } catch {
    // Fall back to literal match
    return content.includes(pattern);
  }
}

function escapeRegexChars(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
