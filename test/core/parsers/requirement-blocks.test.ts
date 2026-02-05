import { describe, it, expect } from 'vitest';
import {
  extractRequirementsSection,
  parseDeltaSpec,
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
});
