import { describe, it, expect } from 'vitest';
import { parseSchema, SchemaValidationError, resolveArtifactFilename, resolveSpecArtifactFiles } from '../../../src/core/artifact-graph/schema.js';

describe('artifact-graph/schema', () => {
  describe('parseSchema', () => {
    it('should parse valid schema YAML', () => {
      const yaml = `
name: test-schema
version: 1
description: A test schema
artifacts:
  - id: proposal
    generates: proposal.md
    description: Initial proposal
    template: templates/proposal.md
    requires: []
  - id: design
    generates: design.md
    description: Design document
    template: templates/design.md
    requires:
      - proposal
`;
      const schema = parseSchema(yaml);

      expect(schema.name).toBe('test-schema');
      expect(schema.version).toBe(1);
      expect(schema.description).toBe('A test schema');
      expect(schema.artifacts).toHaveLength(2);
      expect(schema.artifacts[0].id).toBe('proposal');
      expect(schema.artifacts[1].requires).toEqual(['proposal']);
    });

    it('should throw on missing required fields', () => {
      const yaml = `
name: test-schema
version: 1
artifacts:
  - id: proposal
    description: Missing generates and template
`;
      expect(() => parseSchema(yaml)).toThrow(SchemaValidationError);
      expect(() => parseSchema(yaml)).toThrow(/generates/);
    });

    it('should throw on missing schema name', () => {
      const yaml = `
version: 1
artifacts:
  - id: proposal
    generates: proposal.md
    description: Test
    template: templates/proposal.md
`;
      expect(() => parseSchema(yaml)).toThrow(SchemaValidationError);
      expect(() => parseSchema(yaml)).toThrow(/name/);
    });

    it('should throw on invalid version (non-positive)', () => {
      const yaml = `
name: test
version: 0
artifacts:
  - id: proposal
    generates: proposal.md
    description: Test
    template: templates/proposal.md
`;
      expect(() => parseSchema(yaml)).toThrow(SchemaValidationError);
      expect(() => parseSchema(yaml)).toThrow(/positive/);
    });

    it('should throw on empty artifacts array', () => {
      const yaml = `
name: test
version: 1
artifacts: []
`;
      expect(() => parseSchema(yaml)).toThrow(SchemaValidationError);
      expect(() => parseSchema(yaml)).toThrow(/artifact/i);
    });

    it('should throw on duplicate artifact IDs', () => {
      const yaml = `
name: test
version: 1
artifacts:
  - id: proposal
    generates: proposal.md
    description: First
    template: templates/proposal.md
  - id: proposal
    generates: other.md
    description: Duplicate
    template: templates/other.md
`;
      expect(() => parseSchema(yaml)).toThrow(SchemaValidationError);
      expect(() => parseSchema(yaml)).toThrow(/Duplicate artifact ID: proposal/);
    });

    it('should throw on invalid requires reference', () => {
      const yaml = `
name: test
version: 1
artifacts:
  - id: design
    generates: design.md
    description: Design doc
    template: templates/design.md
    requires:
      - nonexistent
`;
      expect(() => parseSchema(yaml)).toThrow(SchemaValidationError);
      expect(() => parseSchema(yaml)).toThrow(/Invalid dependency reference.*nonexistent/);
    });

    it('should detect self-referencing cycle', () => {
      const yaml = `
name: test
version: 1
artifacts:
  - id: A
    generates: a.md
    description: Self reference
    template: templates/a.md
    requires:
      - A
`;
      expect(() => parseSchema(yaml)).toThrow(SchemaValidationError);
      expect(() => parseSchema(yaml)).toThrow(/Cyclic dependency detected/);
    });

    it('should detect simple A → B → A cycle', () => {
      const yaml = `
name: test
version: 1
artifacts:
  - id: A
    generates: a.md
    description: A
    template: templates/a.md
    requires:
      - B
  - id: B
    generates: b.md
    description: B
    template: templates/b.md
    requires:
      - A
`;
      expect(() => parseSchema(yaml)).toThrow(SchemaValidationError);
      expect(() => parseSchema(yaml)).toThrow(/Cyclic dependency detected/);
      expect(() => parseSchema(yaml)).toThrow(/→/);
    });

    it('should detect longer A → B → C → A cycle and list all IDs', () => {
      const yaml = `
name: test
version: 1
artifacts:
  - id: A
    generates: a.md
    description: A
    template: templates/a.md
    requires:
      - C
  - id: B
    generates: b.md
    description: B
    template: templates/b.md
    requires:
      - A
  - id: C
    generates: c.md
    description: C
    template: templates/c.md
    requires:
      - B
`;
      expect(() => parseSchema(yaml)).toThrow(SchemaValidationError);
      expect(() => parseSchema(yaml)).toThrow(/Cyclic dependency detected/);
      // Should contain all three in the cycle path
      const error = (() => {
        try {
          parseSchema(yaml);
        } catch (e) {
          return e;
        }
      })() as Error;
      expect(error.message).toMatch(/A.*→.*B|B.*→.*C|C.*→.*A/);
    });

    it('should allow default empty requires array', () => {
      const yaml = `
name: test
version: 1
artifacts:
  - id: root
    generates: root.md
    description: Root artifact
    template: templates/root.md
`;
      const schema = parseSchema(yaml);
      expect(schema.artifacts[0].requires).toEqual([]);
    });

    it('should apply default changeVerify and requiredSpecArtifacts', () => {
      const yaml = `
name: test
version: 1
artifacts:
  - id: proposal
    generates: proposal.md
    description: Proposal
    template: templates/proposal.md
`;
      const schema = parseSchema(yaml);
      expect(schema.changeVerify).toEqual({
        artifact: 'specs',
        requirementPattern: '### Requirement: {name}',
        scenarioPattern: '#### Scenario: {name}',
        shallMustPattern: 'SHALL|MUST',
      });
      expect(schema.requiredSpecArtifacts).toEqual(['specs']);
    });

    it('should parse custom changeVerify and requiredSpecArtifacts', () => {
      const yaml = `
name: test
version: 1
changeVerify:
  artifact: verify-custom
  requirementPattern: "## RF: {name}"
  scenarioPattern: "### Scenario: {name}"
requiredSpecArtifacts:
  - specs
  - verify
artifacts:
  - id: proposal
    generates: proposal.md
    description: Proposal
    template: templates/proposal.md
`;
      const schema = parseSchema(yaml);
      expect(schema.changeVerify).toEqual({
        artifact: 'verify-custom',
        requirementPattern: '## RF: {name}',
        scenarioPattern: '### Scenario: {name}',
        shallMustPattern: 'SHALL|MUST',
      });
      expect(schema.requiredSpecArtifacts).toEqual(['specs', 'verify']);
    });

    it('should apply default deltas and validations to specs artifact', () => {
      const yaml = `
name: test
version: 1
artifacts:
  - id: specs
    generates: "specs/**/*.md"
    description: Specs
    template: templates/spec.md
`;
      const schema = parseSchema(yaml);
      const specsArtifact = schema.artifacts.find(a => a.id === 'specs');
      expect(specsArtifact?.deltas).toEqual([
        { section: 'Requirements', pattern: '### Requirement: {name}' },
      ]);
      expect(specsArtifact?.validations).toEqual([
        { pattern: '## Purpose', required: true },
        { pattern: '## Requirements', required: true },
        { pattern: '### Requirement: {name}', required: true, scope: 'Requirements' },
        { pattern: '#### Scenario: {name}', required: true, eachBlock: 'Requirements' },
        { pattern: 'SHALL|MUST', required: true, eachBlock: 'Requirements' },
      ]);
    });

    it('should preserve custom deltas on specs artifact', () => {
      const yaml = `
name: test
version: 1
artifacts:
  - id: specs
    generates: "specs/**/*.md"
    description: Specs
    template: templates/spec.md
    deltas:
      - section: Functional Requirements
        pattern: "## RF-{name}:"
    validations:
      - pattern: "## Purpose"
        required: true
`;
      const schema = parseSchema(yaml);
      const specsArtifact = schema.artifacts.find(a => a.id === 'specs');
      expect(specsArtifact?.deltas).toEqual([
        { section: 'Functional Requirements', pattern: '## RF-{name}:' },
      ]);
      expect(specsArtifact?.validations).toEqual([
        { pattern: '## Purpose', required: true },
      ]);
    });

    it('should not apply deltas/validations defaults to non-specs artifacts', () => {
      const yaml = `
name: test
version: 1
artifacts:
  - id: proposal
    generates: proposal.md
    description: Proposal
    template: templates/proposal.md
`;
      const schema = parseSchema(yaml);
      const proposalArtifact = schema.artifacts.find(a => a.id === 'proposal');
      expect(proposalArtifact?.deltas).toBeUndefined();
      expect(proposalArtifact?.validations).toBeUndefined();
    });

    it('should throw on changeVerify.scenarioPattern missing {name} placeholder', () => {
      const yaml = `
name: test
version: 1
changeVerify:
  scenarioPattern: "#### Scenario:"
artifacts:
  - id: proposal
    generates: proposal.md
    description: Proposal
    template: templates/proposal.md
`;
      expect(() => parseSchema(yaml)).toThrow(SchemaValidationError);
      expect(() => parseSchema(yaml)).toThrow(/changeVerify.scenarioPattern must include \{name\}/);
    });

    it('should throw on artifact deltas[].pattern missing {name} placeholder', () => {
      const yaml = `
name: test
version: 1
artifacts:
  - id: specs
    generates: "specs/**/*.md"
    description: Specs
    template: templates/spec.md
    deltas:
      - section: Requirements
        pattern: "### Requirement:"
`;
      expect(() => parseSchema(yaml)).toThrow(SchemaValidationError);
      expect(() => parseSchema(yaml)).toThrow(/deltas\[\].pattern must include \{name\}/);
    });

    it('should throw on validations entry with both scope and eachBlock', () => {
      const yaml = `
name: test
version: 1
artifacts:
  - id: specs
    generates: "specs/**/*.md"
    description: Specs
    template: templates/spec.md
    validations:
      - pattern: "SHALL|MUST"
        required: true
        scope: Requirements
        eachBlock: Requirements
`;
      expect(() => parseSchema(yaml)).toThrow(SchemaValidationError);
      expect(() => parseSchema(yaml)).toThrow(/mutually exclusive/);
    });
  });

  describe('resolveArtifactFilename', () => {
    it('should return last segment of concrete generates path', () => {
      const artifact = { id: 'verify', generates: 'specs/**/verify.md', description: '', template: 'templates/verify.md', requires: [] };
      expect(resolveArtifactFilename(artifact)).toBe('verify.md');
    });

    it('should fall back to template when generates has wildcard in last segment', () => {
      const artifact = { id: 'specs', generates: 'specs/**/*.md', description: '', template: 'spec.md', requires: [] };
      expect(resolveArtifactFilename(artifact)).toBe('spec.md');
    });

    it('should return last segment for simple filename', () => {
      const artifact = { id: 'proposal', generates: 'proposal.md', description: '', template: 'templates/proposal.md', requires: [] };
      expect(resolveArtifactFilename(artifact)).toBe('proposal.md');
    });
  });

  describe('resolveSpecArtifactFiles', () => {
    it('should resolve default requiredSpecArtifacts to spec.md with deltas', () => {
      const yaml = `
name: test
version: 1
artifacts:
  - id: specs
    generates: "specs/**/*.md"
    description: Specs
    template: spec.md
`;
      const schema = parseSchema(yaml);
      const files = resolveSpecArtifactFiles(schema);

      expect(files).toHaveLength(1);
      expect(files[0].filename).toBe('spec.md');
      expect(files[0].deltas).toEqual([
        { section: 'Requirements', pattern: '### Requirement: {name}' },
      ]);
    });

    it('should resolve multiple requiredSpecArtifacts', () => {
      const yaml = `
name: test
version: 1
requiredSpecArtifacts:
  - specs
  - verify
artifacts:
  - id: specs
    generates: "specs/**/*.md"
    description: Specs
    template: spec.md
  - id: verify
    generates: "specs/**/verify.md"
    description: Verification
    template: templates/verify.md
`;
      const schema = parseSchema(yaml);
      const files = resolveSpecArtifactFiles(schema);

      expect(files).toHaveLength(2);
      expect(files[0].filename).toBe('spec.md');
      expect(files[0].deltas).toBeDefined();
      expect(files[1].filename).toBe('verify.md');
      expect(files[1].deltas).toBeUndefined();
    });

    it('should fall back to id.md for unknown artifact IDs', () => {
      const yaml = `
name: test
version: 1
requiredSpecArtifacts:
  - specs
  - unknown
artifacts:
  - id: specs
    generates: "specs/**/*.md"
    description: Specs
    template: spec.md
`;
      const schema = parseSchema(yaml);
      const files = resolveSpecArtifactFiles(schema);

      expect(files).toHaveLength(2);
      expect(files[0].filename).toBe('spec.md');
      expect(files[1].filename).toBe('unknown.md');
    });
  });
});
