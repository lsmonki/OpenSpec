import { describe, it, expect } from 'vitest';
import { Validator, extractSectionContent, splitIntoBlocks } from '../../src/core/validation/validator.js';
import type { ValidationRule } from '../../src/core/artifact-graph/types.js';

describe('extractSectionContent', () => {
  it('should extract content of a named ## section', () => {
    const content = `# Title

## Purpose
This is the purpose.

## Requirements
### Requirement: Auth
The system SHALL authenticate.

## Notes
Some notes.
`;
    const result = extractSectionContent(content, 'Requirements');
    expect(result).toContain('### Requirement: Auth');
    expect(result).toContain('The system SHALL authenticate.');
    expect(result).not.toContain('Purpose');
    expect(result).not.toContain('Some notes');
  });

  it('should return undefined for non-existent section', () => {
    const content = `# Title

## Purpose
Content.
`;
    expect(extractSectionContent(content, 'Requirements')).toBeUndefined();
  });

  it('should be case-insensitive for section names', () => {
    const content = `## requirements
Content here.
`;
    const result = extractSectionContent(content, 'Requirements');
    expect(result).toContain('Content here.');
  });

  it('should extract section up to end of file when last section', () => {
    const content = `## Purpose
Purpose text.

## Requirements
Req content here.
`;
    const result = extractSectionContent(content, 'Requirements');
    expect(result).toContain('Req content here.');
  });
});

describe('splitIntoBlocks', () => {
  it('should split section content into ### blocks', () => {
    const sectionContent = `
### Requirement: Auth
The system SHALL authenticate users.

#### Scenario: Login
WHEN user enters credentials THEN access is granted.

### Requirement: Logging
The system SHALL log all requests.
`;
    const blocks = splitIntoBlocks(sectionContent);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].name).toBe('Requirement: Auth');
    expect(blocks[0].content).toContain('SHALL authenticate');
    expect(blocks[0].content).toContain('#### Scenario: Login');
    expect(blocks[1].name).toBe('Requirement: Logging');
    expect(blocks[1].content).toContain('SHALL log');
  });

  it('should return empty array when no ### blocks', () => {
    const sectionContent = `Just some text without any blocks.`;
    expect(splitIntoBlocks(sectionContent)).toHaveLength(0);
  });

  it('should handle single block', () => {
    const sectionContent = `### Only Block
Content.
`;
    const blocks = splitIntoBlocks(sectionContent);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe('Only Block');
  });
});

describe('Validator.validateContentRules', () => {
  const validator = new Validator();

  describe('file-level validation (no scope/eachBlock)', () => {
    it('should pass when required pattern exists in content', () => {
      const content = `## Purpose\nThis is the purpose.\n\n## Requirements\nContent.`;
      const rules: ValidationRule[] = [
        { pattern: '## Purpose', required: true },
        { pattern: '## Requirements', required: true },
      ];
      const issues = validator.validateContentRules(content, rules, 'test.md');
      expect(issues).toHaveLength(0);
    });

    it('should fail when required pattern is missing', () => {
      const content = `## Purpose\nContent.`;
      const rules: ValidationRule[] = [
        { pattern: '## Requirements', required: true },
      ];
      const issues = validator.validateContentRules(content, rules, 'test.md');
      expect(issues).toHaveLength(1);
      expect(issues[0].level).toBe('ERROR');
      expect(issues[0].message).toContain('## Requirements');
    });

    it('should emit warnings for non-required rules', () => {
      const content = `## Purpose\nContent.`;
      const rules: ValidationRule[] = [
        { pattern: '## Optional', required: false },
      ];
      const issues = validator.validateContentRules(content, rules, 'test.md');
      expect(issues).toHaveLength(1);
      expect(issues[0].level).toBe('WARNING');
      expect(issues[0].message).toContain('recommended');
    });

    it('should match regex patterns like SHALL|MUST', () => {
      const content = `The system SHALL do something.`;
      const rules: ValidationRule[] = [
        { pattern: 'SHALL|MUST', required: true },
      ];
      const issues = validator.validateContentRules(content, rules, 'test.md');
      expect(issues).toHaveLength(0);
    });

    it('should match patterns with {name} placeholder', () => {
      const content = `### Requirement: Auth\nThe system SHALL authenticate.`;
      const rules: ValidationRule[] = [
        { pattern: '### Requirement: {name}', required: true },
      ];
      const issues = validator.validateContentRules(content, rules, 'test.md');
      expect(issues).toHaveLength(0);
    });
  });

  describe('scope-level validation', () => {
    it('should pass when pattern exists within scoped section', () => {
      const content = `## Purpose\nText.\n\n## Requirements\n### Requirement: Auth\nContent.`;
      const rules: ValidationRule[] = [
        { pattern: '### Requirement: {name}', required: true, scope: 'Requirements' },
      ];
      const issues = validator.validateContentRules(content, rules, 'test.md');
      expect(issues).toHaveLength(0);
    });

    it('should fail when pattern is missing from scoped section', () => {
      const content = `## Purpose\n### Requirement: Auth\nContent.\n\n## Requirements\nEmpty section.`;
      const rules: ValidationRule[] = [
        { pattern: '### Requirement: {name}', required: true, scope: 'Requirements' },
      ];
      const issues = validator.validateContentRules(content, rules, 'test.md');
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('## Requirements');
      expect(issues[0].message).toContain('### Requirement: {name}');
    });

    it('should error when scoped section does not exist', () => {
      const content = `## Purpose\nContent.`;
      const rules: ValidationRule[] = [
        { pattern: '### Requirement: {name}', required: true, scope: 'Requirements' },
      ];
      const issues = validator.validateContentRules(content, rules, 'test.md');
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('not found');
    });
  });

  describe('eachBlock-level validation', () => {
    it('should pass when pattern exists in every block', () => {
      const content = `## Requirements
### Requirement: Auth
The system SHALL authenticate.

#### Scenario: Login
WHEN user logs in THEN access is granted.

### Requirement: Logging
The system MUST log requests.

#### Scenario: Request logging
WHEN request arrives THEN it is logged.
`;
      const rules: ValidationRule[] = [
        { pattern: '#### Scenario: {name}', required: true, eachBlock: 'Requirements' },
        { pattern: 'SHALL|MUST', required: true, eachBlock: 'Requirements' },
      ];
      const issues = validator.validateContentRules(content, rules, 'test.md');
      expect(issues).toHaveLength(0);
    });

    it('should fail when pattern is missing from one block', () => {
      const content = `## Requirements
### Requirement: Auth
The system SHALL authenticate.

#### Scenario: Login
WHEN user logs in THEN access is granted.

### Requirement: Logging
This describes logging but has no normative keyword.
`;
      const rules: ValidationRule[] = [
        { pattern: 'SHALL|MUST', required: true, eachBlock: 'Requirements' },
      ];
      const issues = validator.validateContentRules(content, rules, 'test.md');
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('Requirement: Logging');
      expect(issues[0].message).toContain('SHALL|MUST');
    });

    it('should fail when scenario is missing from one block', () => {
      const content = `## Requirements
### Requirement: Auth
The system SHALL authenticate.

### Requirement: Logging
The system MUST log requests.

#### Scenario: Logging scenario
WHEN request arrives THEN it is logged.
`;
      const rules: ValidationRule[] = [
        { pattern: '#### Scenario: {name}', required: true, eachBlock: 'Requirements' },
      ];
      const issues = validator.validateContentRules(content, rules, 'test.md');
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('Requirement: Auth');
    });

    it('should error when eachBlock section does not exist', () => {
      const content = `## Purpose\nContent.`;
      const rules: ValidationRule[] = [
        { pattern: 'SHALL|MUST', required: true, eachBlock: 'Requirements' },
      ];
      const issues = validator.validateContentRules(content, rules, 'test.md');
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('not found');
    });

    it('should warn when eachBlock section has no blocks', () => {
      const content = `## Requirements\nJust text, no blocks.`;
      const rules: ValidationRule[] = [
        { pattern: 'SHALL|MUST', required: true, eachBlock: 'Requirements' },
      ];
      const issues = validator.validateContentRules(content, rules, 'test.md');
      expect(issues).toHaveLength(1);
      expect(issues[0].level).toBe('WARNING');
    });
  });
});

describe('Validator.crossFileVerify', () => {
  const validator = new Validator();

  it('should pass when verification file has scenarios', () => {
    const specContent = `## Requirements
### Requirement: Auth
The system SHALL authenticate users.
`;
    const verifyContent = `#### Scenario: Auth login
WHEN user enters credentials THEN access is granted.
`;
    const issues = validator.crossFileVerify(specContent, verifyContent, {
      requirementPattern: '### Requirement: {name}',
      scenarioPattern: '#### Scenario: {name}',
    }, 'test/spec.md');
    expect(issues).toHaveLength(0);
  });

  it('should fail when verification file has no scenarios at all', () => {
    const specContent = `## Requirements
### Requirement: Auth
The system SHALL authenticate users.
`;
    const verifyContent = `No scenarios here.`;
    const issues = validator.crossFileVerify(specContent, verifyContent, {
      requirementPattern: '### Requirement: {name}',
      scenarioPattern: '#### Scenario: {name}',
    }, 'test/spec.md');
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('ERROR');
    expect(issues[0].message).toContain('Auth');
  });

  it('should return no issues when spec has no requirements', () => {
    const specContent = `## Purpose\nJust a purpose section.`;
    const verifyContent = `No scenarios.`;
    const issues = validator.crossFileVerify(specContent, verifyContent, {
      requirementPattern: '### Requirement: {name}',
      scenarioPattern: '#### Scenario: {name}',
    }, 'test/spec.md');
    expect(issues).toHaveLength(0);
  });
});
