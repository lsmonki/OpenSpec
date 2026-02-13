import { describe, it, expect } from 'vitest';
import {
  extractRequirementsSection,
  parseDeltaSpec,
  parseDeltaSpecMulti,
  RequirementFormatConfig,
} from '../../../src/core/parsers/requirement-blocks.js';

describe('requirement-blocks', () => {
  describe('extractRequirementsSection', () => {
    it('should extract requirements with default pattern', () => {
      const content = `# Spec

## Purpose
Test

## Requirements

### Requirement: User login
Users can log in.

### Requirement: User logout
Users can log out.
`;

      const result = extractRequirementsSection(content);
      expect(result.bodyBlocks).toHaveLength(2);
      expect(result.bodyBlocks[0].name).toBe('User login');
      expect(result.bodyBlocks[1].name).toBe('User logout');
    });

    it('should extract requirements with custom section name', () => {
      const content = `# Spec

## Purpose
Test

## Functional Requirements

### Requirement: User login
Users can log in.
`;

      const config: RequirementFormatConfig = {
        sectionName: 'Functional Requirements',
      };

      const result = extractRequirementsSection(content, config);
      expect(result.headerLine).toBe('## Functional Requirements');
      expect(result.bodyBlocks).toHaveLength(1);
      expect(result.bodyBlocks[0].name).toBe('User login');
    });

    it('should extract requirements with custom requirement pattern', () => {
      const content = `# Spec

## Purpose
Test

## Requirements

### RF-001
Users can log in.

### RF-002
Users can log out.
`;

      const config: RequirementFormatConfig = {
        requirementPattern: '### RF-{name}',
      };

      const result = extractRequirementsSection(content, config);
      expect(result.bodyBlocks).toHaveLength(2);
      expect(result.bodyBlocks[0].name).toBe('001');
      expect(result.bodyBlocks[1].name).toBe('002');
    });

    it('should create empty section when section not found', () => {
      const content = `# Spec

## Purpose
Test
`;

      const result = extractRequirementsSection(content);
      expect(result.headerLine).toBe('## Requirements');
      expect(result.bodyBlocks).toHaveLength(0);
    });

    it('should create empty section with custom name when not found', () => {
      const content = `# Spec

## Purpose
Test
`;

      const config: RequirementFormatConfig = {
        sectionName: 'Functional Requirements',
      };

      const result = extractRequirementsSection(content, config);
      expect(result.headerLine).toBe('## Functional Requirements');
      expect(result.bodyBlocks).toHaveLength(0);
    });
  });

  describe('parseDeltaSpec', () => {
    it('should parse delta with default section names', () => {
      const content = `## ADDED Requirements

### Requirement: New feature
This is a new feature.

## MODIFIED Requirements

### Requirement: Existing feature
Updated behavior.

## REMOVED Requirements

### Requirement: Old feature
`;

      const result = parseDeltaSpec(content);
      expect(result.added).toHaveLength(1);
      expect(result.added[0].name).toBe('New feature');
      expect(result.modified).toHaveLength(1);
      expect(result.modified[0].name).toBe('Existing feature');
      expect(result.removed).toHaveLength(1);
      expect(result.removed[0]).toBe('Old feature');
    });

    it('should parse delta with custom section name', () => {
      const content = `## ADDED Functional Requirements

### Requirement: New feature
This is a new feature.

## MODIFIED Functional Requirements

### Requirement: Existing feature
Updated behavior.
`;

      const config: RequirementFormatConfig = {
        sectionName: 'Functional Requirements',
      };

      const result = parseDeltaSpec(content, config);
      expect(result.added).toHaveLength(1);
      expect(result.added[0].name).toBe('New feature');
      expect(result.modified).toHaveLength(1);
      expect(result.modified[0].name).toBe('Existing feature');
      expect(result.sectionPresence.added).toBe(true);
      expect(result.sectionPresence.modified).toBe(true);
    });

    it('should parse delta with custom requirement pattern', () => {
      const content = `## ADDED Requirements

### RF-001
This is a new feature.

## MODIFIED Requirements

### RF-002
Updated behavior.
`;

      const config: RequirementFormatConfig = {
        requirementPattern: '### RF-{name}',
      };

      const result = parseDeltaSpec(content, config);
      expect(result.added).toHaveLength(1);
      expect(result.added[0].name).toBe('001');
      expect(result.modified).toHaveLength(1);
      expect(result.modified[0].name).toBe('002');
    });

    it('should parse renamed requirements with custom pattern', () => {
      const content = `## RENAMED Requirements

- FROM: \`### Requirement: Old name\`
- TO: \`### Requirement: New name\`
`;

      const result = parseDeltaSpec(content);
      expect(result.renamed).toHaveLength(1);
      expect(result.renamed[0].from).toBe('Old name');
      expect(result.renamed[0].to).toBe('New name');
    });

    it('should detect section presence correctly', () => {
      const content = `## ADDED Requirements

### Requirement: New feature
Content
`;

      const result = parseDeltaSpec(content);
      expect(result.sectionPresence.added).toBe(true);
      expect(result.sectionPresence.modified).toBe(false);
      expect(result.sectionPresence.removed).toBe(false);
      expect(result.sectionPresence.renamed).toBe(false);
    });
  });

  describe('parseDeltaSpecMulti', () => {
    it('should parse multiple delta sections from a single file', () => {
      const content = `## ADDED Requirements

### Requirement: New feature
The system SHALL support this.

## ADDED Constraints

### Constraint: Performance limit
The system SHALL respond within 200ms.
`;

      const result = parseDeltaSpecMulti(content, [
        { section: 'Requirements', pattern: '### Requirement: {name}' },
        { section: 'Constraints', pattern: '### Constraint: {name}' },
      ]);

      expect(result.sections).toHaveLength(2);

      const reqSection = result.sections[0];
      expect(reqSection.sectionName).toBe('Requirements');
      expect(reqSection.added).toHaveLength(1);
      expect(reqSection.added[0].name).toBe('New feature');

      const conSection = result.sections[1];
      expect(conSection.sectionName).toBe('Constraints');
      expect(conSection.added).toHaveLength(1);
      expect(conSection.added[0].name).toBe('Performance limit');
    });

    it('should handle sections with mixed operations', () => {
      const content = `## ADDED Requirements

### Requirement: New feature
Description.

## MODIFIED Constraints

### Constraint: Existing limit
Updated description.

## REMOVED Requirements

### Requirement: Old feature
`;

      const result = parseDeltaSpecMulti(content, [
        { section: 'Requirements', pattern: '### Requirement: {name}' },
        { section: 'Constraints', pattern: '### Constraint: {name}' },
      ]);

      expect(result.sections).toHaveLength(2);

      const reqSection = result.sections[0];
      expect(reqSection.added).toHaveLength(1);
      expect(reqSection.removed).toHaveLength(1);
      expect(reqSection.sectionPresence.added).toBe(true);
      expect(reqSection.sectionPresence.removed).toBe(true);
      expect(reqSection.sectionPresence.modified).toBe(false);

      const conSection = result.sections[1];
      expect(conSection.modified).toHaveLength(1);
      expect(conSection.modified[0].name).toBe('Existing limit');
      expect(conSection.sectionPresence.modified).toBe(true);
      expect(conSection.sectionPresence.added).toBe(false);
    });

    it('should return empty sections when no matching deltas found', () => {
      const content = `## ADDED Requirements

### Requirement: Something
Text.
`;

      const result = parseDeltaSpecMulti(content, [
        { section: 'Requirements', pattern: '### Requirement: {name}' },
        { section: 'Constraints', pattern: '### Constraint: {name}' },
      ]);

      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].added).toHaveLength(1);
      expect(result.sections[1].added).toHaveLength(0);
      expect(result.sections[1].sectionPresence.added).toBe(false);
    });
  });
});
