import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { findSpecUpdates, buildUpdatedSpec } from '../../src/core/specs-apply.js';

describe('specs-apply', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `openspec-specs-apply-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('findSpecUpdates', () => {
    it('should discover all markdown files in spec folders', async () => {
      const changeDir = path.join(tempDir, 'change');
      const mainSpecsDir = path.join(tempDir, 'specs');

      // Create change specs with multiple files
      const changeSpecDir = path.join(changeDir, 'specs', 'auth');
      await fs.mkdir(changeSpecDir, { recursive: true });
      await fs.writeFile(path.join(changeSpecDir, 'spec.md'), '## ADDED Requirements\n### Requirement: Auth\nSHALL authenticate.\n#### Scenario: Login\nWHEN login THEN ok.');
      await fs.writeFile(path.join(changeSpecDir, 'verify.md'), '# Verification\nTest scenarios.');

      const updates = await findSpecUpdates(changeDir, mainSpecsDir);
      expect(updates).toHaveLength(2);

      const specUpdate = updates.find(u => path.basename(u.source) === 'spec.md');
      const verifyUpdate = updates.find(u => path.basename(u.source) === 'verify.md');

      expect(specUpdate).toBeDefined();
      expect(specUpdate!.isDelta).toBe(true);
      expect(verifyUpdate).toBeDefined();
      expect(verifyUpdate!.isDelta).toBe(false);
    });

    it('should detect existing targets', async () => {
      const changeDir = path.join(tempDir, 'change');
      const mainSpecsDir = path.join(tempDir, 'specs');

      // Create change spec
      const changeSpecDir = path.join(changeDir, 'specs', 'auth');
      await fs.mkdir(changeSpecDir, { recursive: true });
      await fs.writeFile(path.join(changeSpecDir, 'spec.md'), '## ADDED Requirements\n### Requirement: Auth\nSHALL authenticate.\n#### Scenario: Login\nWHEN login THEN ok.');

      // Create existing target
      const targetDir = path.join(mainSpecsDir, 'auth');
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(path.join(targetDir, 'spec.md'), '# Auth Spec\n## Purpose\nAuth.\n## Requirements\n');

      const updates = await findSpecUpdates(changeDir, mainSpecsDir);
      expect(updates).toHaveLength(1);
      expect(updates[0].exists).toBe(true);
    });

    it('should skip non-markdown files', async () => {
      const changeDir = path.join(tempDir, 'change');
      const mainSpecsDir = path.join(tempDir, 'specs');

      const changeSpecDir = path.join(changeDir, 'specs', 'auth');
      await fs.mkdir(changeSpecDir, { recursive: true });
      await fs.writeFile(path.join(changeSpecDir, 'spec.md'), '## ADDED Requirements\n### Requirement: Auth\nSHALL authenticate.\n#### Scenario: Login\nWHEN login THEN ok.');
      await fs.writeFile(path.join(changeSpecDir, 'notes.txt'), 'Not a markdown file.');

      const updates = await findSpecUpdates(changeDir, mainSpecsDir);
      expect(updates).toHaveLength(1);
      expect(path.basename(updates[0].source)).toBe('spec.md');
    });

    it('should determine isDelta from specArtifactFiles config', async () => {
      const changeDir = path.join(tempDir, 'change');
      const mainSpecsDir = path.join(tempDir, 'specs');

      const changeSpecDir = path.join(changeDir, 'specs', 'auth');
      await fs.mkdir(changeSpecDir, { recursive: true });
      await fs.writeFile(path.join(changeSpecDir, 'spec.md'), '## ADDED Requirements\n### Requirement: Auth\nSHALL authenticate.\n#### Scenario: Login\nWHEN login THEN ok.');
      await fs.writeFile(path.join(changeSpecDir, 'verify.md'), '# Verification\nTest scenarios.');

      // Pass specArtifactFiles config: spec.md has deltas, verify.md does not
      const specArtifactFiles = [
        { filename: 'spec.md', deltas: [{ section: 'Requirements', pattern: '### Requirement: {name}' }] },
        { filename: 'verify.md' },
      ];

      const updates = await findSpecUpdates(changeDir, mainSpecsDir, specArtifactFiles);

      const specUpdate = updates.find(u => path.basename(u.source) === 'spec.md');
      const verifyUpdate = updates.find(u => path.basename(u.source) === 'verify.md');

      expect(specUpdate!.isDelta).toBe(true);
      expect(specUpdate!.fileDeltaConfigs).toEqual([{ section: 'Requirements', pattern: '### Requirement: {name}' }]);
      expect(verifyUpdate!.isDelta).toBe(false);
      expect(verifyUpdate!.fileDeltaConfigs).toBeUndefined();
    });
  });

  describe('buildUpdatedSpec with config', () => {
    it('should accept custom delta config for parsing', async () => {
      const changeDir = path.join(tempDir, 'change');
      const mainSpecsDir = path.join(tempDir, 'specs');

      // Create change spec with custom pattern
      const changeSpecDir = path.join(changeDir, 'specs', 'api');
      await fs.mkdir(changeSpecDir, { recursive: true });
      await fs.writeFile(
        path.join(changeSpecDir, 'spec.md'),
        `## ADDED Endpoints

### Endpoint: GET /users
The API SHALL return all users.

#### Scenario: List users
WHEN GET /users THEN return 200 with user list.
`
      );

      // Create existing target with custom section
      const targetDir = path.join(mainSpecsDir, 'api');
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(
        path.join(targetDir, 'spec.md'),
        `# API Spec

## Purpose
API endpoints.

## Endpoints
`
      );

      const update = {
        source: path.join(changeSpecDir, 'spec.md'),
        target: path.join(targetDir, 'spec.md'),
        exists: true,
        isDelta: true,
      };

      const result = await buildUpdatedSpec(update, 'test-change', {
        sectionName: 'Endpoints',
        requirementPattern: '### Endpoint: {name}',
      });

      expect(result.counts.added).toBe(1);
      expect(result.rebuilt).toContain('### Endpoint: GET /users');
      expect(result.rebuilt).toContain('## Endpoints');
    });
  });

  describe('buildUpdatedSpec ADDED already exists', () => {
    it('should throw when ADDED requirement already exists in target', async () => {
      const changeDir = path.join(tempDir, 'change');
      const mainSpecsDir = path.join(tempDir, 'specs');

      const changeSpecDir = path.join(changeDir, 'specs', 'auth');
      await fs.mkdir(changeSpecDir, { recursive: true });
      await fs.writeFile(
        path.join(changeSpecDir, 'spec.md'),
        `## ADDED Requirements

### Requirement: Login
The system SHALL authenticate users via SSO.

#### Scenario: SSO login
WHEN user logs in via SSO THEN access granted.
`
      );

      const targetDir = path.join(mainSpecsDir, 'auth');
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(
        path.join(targetDir, 'spec.md'),
        `# Auth Spec

## Purpose
Authentication.

## Requirements

### Requirement: Login
The system SHALL authenticate users via password.

#### Scenario: Password login
WHEN user logs in with password THEN access granted.
`
      );

      const update = {
        source: path.join(changeSpecDir, 'spec.md'),
        target: path.join(targetDir, 'spec.md'),
        exists: true,
        isDelta: true,
      };

      await expect(buildUpdatedSpec(update, 'test-change')).rejects.toThrow(/already exists/);
    });
  });

  describe('buildUpdatedSpec with multi-delta', () => {
    it('should chain multiple delta configs via targetContent option', async () => {
      const changeDir = path.join(tempDir, 'change');
      const mainSpecsDir = path.join(tempDir, 'specs');

      // Create change spec with two delta sections
      const changeSpecDir = path.join(changeDir, 'specs', 'auth');
      await fs.mkdir(changeSpecDir, { recursive: true });
      await fs.writeFile(
        path.join(changeSpecDir, 'spec.md'),
        `## ADDED Requirements

### Requirement: User Login
The system SHALL authenticate users via password.

#### Scenario: Valid credentials
WHEN user provides correct credentials THEN access is granted.

## ADDED Constraints

### Constraint: Password Length
The system SHALL enforce minimum 8 character passwords.

#### Scenario: Short password
WHEN password is under 8 chars THEN rejected.
`
      );

      // Create existing target with both sections
      const targetDir = path.join(mainSpecsDir, 'auth');
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(
        path.join(targetDir, 'spec.md'),
        `# Auth Specification

## Purpose
Authentication and constraints.

## Requirements

### Requirement: Session Management
The system SHALL manage sessions.

#### Scenario: Session timeout
WHEN session expires THEN logged out.

## Constraints

### Constraint: Max Sessions
The system SHALL limit to 5 concurrent sessions.

#### Scenario: Session limit
WHEN 6th session THEN oldest terminated.
`
      );

      const update = {
        source: path.join(changeSpecDir, 'spec.md'),
        target: path.join(targetDir, 'spec.md'),
        exists: true,
        isDelta: true,
      };

      // First delta: Requirements
      const result1 = await buildUpdatedSpec(update, 'test-change', {
        sectionName: 'Requirements',
        requirementPattern: '### Requirement: {name}',
      });

      expect(result1.counts.added).toBe(1);
      expect(result1.rebuilt).toContain('### Requirement: User Login');
      expect(result1.rebuilt).toContain('### Requirement: Session Management');
      expect(result1.rebuilt).toContain('## Constraints');

      // Second delta: Constraints, chaining from previous result
      const result2 = await buildUpdatedSpec(update, 'test-change', {
        sectionName: 'Constraints',
        requirementPattern: '### Constraint: {name}',
      }, {
        targetContent: result1.rebuilt,
      });

      expect(result2.counts.added).toBe(1);
      expect(result2.rebuilt).toContain('### Constraint: Password Length');
      expect(result2.rebuilt).toContain('### Constraint: Max Sessions');
      // Previous section's merge should be preserved
      expect(result2.rebuilt).toContain('### Requirement: User Login');
      expect(result2.rebuilt).toContain('### Requirement: Session Management');
    });

    it('should return unchanged content with allowEmpty when no deltas for a section', async () => {
      const changeDir = path.join(tempDir, 'change');
      const mainSpecsDir = path.join(tempDir, 'specs');

      // Create change spec with only Requirements deltas
      const changeSpecDir = path.join(changeDir, 'specs', 'auth');
      await fs.mkdir(changeSpecDir, { recursive: true });
      await fs.writeFile(
        path.join(changeSpecDir, 'spec.md'),
        `## ADDED Requirements

### Requirement: User Login
The system SHALL authenticate users.

#### Scenario: Valid credentials
WHEN correct credentials THEN access granted.
`
      );

      const targetContent = `# Auth Spec

## Purpose
Auth.

## Requirements

## Constraints

### Constraint: Existing
The system SHALL exist.

#### Scenario: Exists
WHEN checked THEN exists.
`;

      const update = {
        source: path.join(changeSpecDir, 'spec.md'),
        target: path.join(mainSpecsDir, 'auth', 'spec.md'),
        exists: true,
        isDelta: true,
      };

      // Call with Constraints config — no deltas for this section
      const result = await buildUpdatedSpec(update, 'test-change', {
        sectionName: 'Constraints',
        requirementPattern: '### Constraint: {name}',
      }, {
        targetContent,
        allowEmpty: true,
      });

      expect(result.counts.added).toBe(0);
      expect(result.counts.modified).toBe(0);
      expect(result.counts.removed).toBe(0);
      expect(result.counts.renamed).toBe(0);
      // Content should be unchanged
      expect(result.rebuilt).toBe(targetContent);
    });
  });
});
