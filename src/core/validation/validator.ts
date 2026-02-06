import { z, ZodError } from 'zod';
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
  /** Pattern to identify scenario headers (default: '#### Scenario: {name}') */
  scenarioPattern?: string;
  /** Whether scenarios are required (default: true) */
  scenariosRequired?: boolean;
  /** Which artifact contains scenarios (default: 'specs'). When not 'specs', inline validation is skipped. */
  scenarioArtifact?: string;
  /** Regex pattern to match normative keywords in requirement text (default: 'SHALL|MUST')
   *  Set to null or empty string to disable validation */
  shallMustPattern?: string | null;
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
            requirementPattern: config.requirementPattern,
            scenarioPattern: config.scenarioPattern,
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
            requirementPattern: config.requirementPattern,
            scenarioPattern: config.scenarioPattern,
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

    // Use configured values or defaults
    const sectionName = config?.requirementSection ?? 'Requirements';
    const reqPattern = config?.requirementPattern ?? '### Requirement: {name}';
    const scenarioPattern = config?.scenarioPattern ?? '#### Scenario: {name}';
    const scenarioArtifact = config?.scenarioArtifact ?? 'specs';
    // Skip inline scenario validation when scenarios live in a different artifact
    const scenariosRequired = scenarioArtifact === 'specs' && (config?.scenariosRequired ?? true);
    // Get shallMustPattern - default to 'SHALL|MUST', null/empty disables validation
    const shallMustPattern = config?.shallMustPattern === undefined ? 'SHALL|MUST' : config.shallMustPattern;

    // Build format config for delta parsing
    const deltaConfig: RequirementFormatConfig = {
      sectionName,
      requirementPattern: reqPattern,
    };

    // Build delta section names from config
    const deltaSectionNames = {
      added: `ADDED ${sectionName}`,
      modified: `MODIFIED ${sectionName}`,
      removed: `REMOVED ${sectionName}`,
      renamed: `RENAMED ${sectionName}`,
    };

    try {
      const entries = await fs.readdir(specsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const specName = entry.name;
        const specFile = path.join(specsDir, specName, 'spec.md');
        let content: string | undefined;
        try {
          content = await fs.readFile(specFile, 'utf-8');
        } catch {
          continue;
        }

        const plan = parseDeltaSpec(content, deltaConfig);
        const entryPath = `${specName}/spec.md`;
        const sectionNames: string[] = [];
        if (plan.sectionPresence.added) sectionNames.push(`## ${deltaSectionNames.added}`);
        if (plan.sectionPresence.modified) sectionNames.push(`## ${deltaSectionNames.modified}`);
        if (plan.sectionPresence.removed) sectionNames.push(`## ${deltaSectionNames.removed}`);
        if (plan.sectionPresence.renamed) sectionNames.push(`## ${deltaSectionNames.renamed}`);
        const hasSections = sectionNames.length > 0;
        const hasEntries =
          plan.added.length + plan.modified.length + plan.removed.length + plan.renamed.length > 0;
        if (!hasEntries) {
          if (hasSections) emptySectionSpecs.push({ path: entryPath, sections: sectionNames });
          else missingHeaderSpecs.push(entryPath);
        }

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
              message: `Duplicate requirement in ADDED: "${block.name}"`,
            });
          } else {
            addedNames.add(key);
          }
          const requirementText = this.extractRequirementText(block.raw, reqPattern);
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
          if (scenariosRequired) {
            const scenarioCount = this.countScenarios(block.raw, scenarioPattern);
            if (scenarioCount < 1) {
              issues.push({
                level: 'ERROR',
                path: entryPath,
                message: `ADDED "${block.name}" must include at least one scenario`,
              });
            }
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
              message: `Duplicate requirement in MODIFIED: "${block.name}"`,
            });
          } else {
            modifiedNames.add(key);
          }
          const requirementText = this.extractRequirementText(block.raw, reqPattern);
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
          if (scenariosRequired) {
            const scenarioCount = this.countScenarios(block.raw, scenarioPattern);
            if (scenarioCount < 1) {
              issues.push({
                level: 'ERROR',
                path: entryPath,
                message: `MODIFIED "${block.name}" must include at least one scenario`,
              });
            }
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
              message: `Duplicate requirement in REMOVED: "${name}"`,
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
              message: `Duplicate FROM in RENAMED: "${from}"`,
            });
          } else {
            renamedFrom.add(fromKey);
          }
          if (renamedTo.has(toKey)) {
            issues.push({
              level: 'ERROR',
              path: entryPath,
              message: `Duplicate TO in RENAMED: "${to}"`,
            });
          } else {
            renamedTo.add(toKey);
          }
        }

        // Cross-section conflicts (within the same spec file)
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
    } catch {
      // If no specs dir, treat as no deltas
    }

    // Extract requirement pattern prefix for error message
    const reqPatternPrefix = reqPattern.replace('{name}', '');

    for (const { path: specPath, sections } of emptySectionSpecs) {
      issues.push({
        level: 'ERROR',
        path: specPath,
        message: `Delta sections ${this.formatSectionList(sections)} were found, but no requirement entries parsed. Ensure each section includes at least one "${reqPatternPrefix}" block (REMOVED may use bullet list syntax).`,
      });
    }
    for (const specPath of missingHeaderSpecs) {
      issues.push({
        level: 'ERROR',
        path: specPath,
        message: `No delta sections found. Add headers such as "## ${deltaSectionNames.added}" or move non-delta notes outside specs/.`,
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
    const scenarioArtifact = config?.scenarioArtifact ?? 'specs';
    // Skip inline scenario validation when scenarios live in a different artifact
    const scenariosRequired = scenarioArtifact === 'specs' && (config?.scenariosRequired ?? true);
    const scenarioPattern = config?.scenarioPattern ?? '#### Scenario: {name}';

    if (spec.overview.length < MIN_PURPOSE_LENGTH) {
      issues.push({
        level: 'WARNING',
        path: 'overview',
        message: VALIDATION_MESSAGES.PURPOSE_TOO_BRIEF,
      });
    }

    // Get shallMustPattern - default to 'SHALL|MUST', null/empty disables validation
    const shallMustPattern = config?.shallMustPattern === undefined ? 'SHALL|MUST' : config.shallMustPattern;

    spec.requirements.forEach((req, index) => {
      // Check for normative keywords in requirement text (if pattern is configured)
      if (shallMustPattern && !this.matchesNormativePattern(req.text, shallMustPattern)) {
        issues.push({
          level: 'ERROR',
          path: `requirements[${index}].text`,
          message: `${VALIDATION_MESSAGES.REQUIREMENT_NO_SHALL} (pattern: ${shallMustPattern})`,
        });
      }

      if (req.text.length > MAX_REQUIREMENT_TEXT_LENGTH) {
        issues.push({
          level: 'INFO',
          path: `requirements[${index}]`,
          message: VALIDATION_MESSAGES.REQUIREMENT_TOO_LONG,
        });
      }

      if (scenariosRequired && req.scenarios.length === 0) {
        // Use configured pattern in guidance
        const patternExample = scenarioPattern.replace('{name}', 'Example scenario');
        issues.push({
          level: 'ERROR',
          path: `requirements[${index}].scenarios`,
          message: `${VALIDATION_MESSAGES.REQUIREMENT_NO_SCENARIOS}. Use "${patternExample}" format.`,
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
      // Use configured section name in guidance
      const deltaHeaders = `## ADDED ${sectionName}, ## MODIFIED ${sectionName}, ## REMOVED ${sectionName}, or ## RENAMED ${sectionName}`;
      return `${msg}. Change specs must include ${deltaHeaders}. Files must live under openspec/changes/{id}/specs/<capability>/spec.md.`;
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
   * The pattern is a regex string (e.g., "SHALL|MUST" or "(?i)shall|must").
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
}
