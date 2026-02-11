import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { findSpecUpdates, buildUpdatedSpec } from '../../src/core/specs-apply.js';
import { parseDeltaSpecMulti } from '../../src/core/parsers/requirement-blocks.js';
import { Validator, extractSectionContent, splitIntoBlocks } from '../../src/core/validation/validator.js';
import type { ValidationRule } from '../../src/core/artifact-graph/types.js';
import type { DeltaConfig } from '../../src/core/artifact-graph/types.js';

describe('configurable-format integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `openspec-cfg-fmt-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // 9.2 — Multi-file spec (spec.md + verify.md with separate deltas[])
  // -----------------------------------------------------------------------
  describe('multi-file spec with separate deltas (9.2)', () => {
    it('should discover spec.md as delta and verify.md as direct-copy', async () => {
      const changeDir = path.join(tempDir, 'change');
      const mainSpecsDir = path.join(tempDir, 'specs');

      // Create change spec folder with spec.md (delta) and verify.md (direct-copy)
      const changeSpecDir = path.join(changeDir, 'specs', 'auth');
      await fs.mkdir(changeSpecDir, { recursive: true });
      await fs.writeFile(
        path.join(changeSpecDir, 'spec.md'),
        `## ADDED Requirements

### Requirement: User Login
The system SHALL authenticate users via password.

#### Scenario: Valid credentials
WHEN user provides correct credentials THEN access is granted.
`
      );
      await fs.writeFile(
        path.join(changeSpecDir, 'verify.md'),
        `# Verification Criteria

## Test Cases

#### Scenario: Login integration test
GIVEN the application is running
WHEN user submits login form with valid credentials
THEN the session is created and user is redirected.
`
      );

      const updates = await findSpecUpdates(changeDir, mainSpecsDir);
      expect(updates).toHaveLength(2);

      const specUpdate = updates.find(u => path.basename(u.source) === 'spec.md');
      const verifyUpdate = updates.find(u => path.basename(u.source) === 'verify.md');

      expect(specUpdate).toBeDefined();
      expect(specUpdate!.isDelta).toBe(true);
      expect(verifyUpdate).toBeDefined();
      expect(verifyUpdate!.isDelta).toBe(false);
    });

    it('should delta-merge spec.md and direct-copy verify.md to target', async () => {
      const changeDir = path.join(tempDir, 'change');
      const mainSpecsDir = path.join(tempDir, 'specs');

      // Create existing target spec.md
      const targetDir = path.join(mainSpecsDir, 'auth');
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(
        path.join(targetDir, 'spec.md'),
        `# Auth Specification

## Purpose
Authentication for the system.

## Requirements

### Requirement: Session Management
The system SHALL manage user sessions.

#### Scenario: Session timeout
WHEN session expires THEN user is logged out.
`
      );

      // Create change delta spec
      const changeSpecDir = path.join(changeDir, 'specs', 'auth');
      await fs.mkdir(changeSpecDir, { recursive: true });
      await fs.writeFile(
        path.join(changeSpecDir, 'spec.md'),
        `## ADDED Requirements

### Requirement: User Login
The system SHALL authenticate users via password.

#### Scenario: Valid credentials
WHEN user provides correct credentials THEN access is granted.
`
      );
      await fs.writeFile(
        path.join(changeSpecDir, 'verify.md'),
        `# Verification Criteria

#### Scenario: Login integration test
WHEN user submits login form THEN session is created.
`
      );

      // Build updates
      const updates = await findSpecUpdates(changeDir, mainSpecsDir);
      const specUpdate = updates.find(u => path.basename(u.source) === 'spec.md')!;
      const verifyUpdate = updates.find(u => path.basename(u.source) === 'verify.md')!;

      // Delta-merge spec.md
      const result = await buildUpdatedSpec(specUpdate, 'test-change');
      expect(result.counts.added).toBe(1);
      expect(result.rebuilt).toContain('### Requirement: User Login');
      expect(result.rebuilt).toContain('### Requirement: Session Management');

      // Direct-copy verify.md: just read source, write to target
      const verifySource = await fs.readFile(verifyUpdate.source, 'utf-8');
      expect(verifySource).toContain('Verification Criteria');
      expect(verifySource).toContain('Login integration test');
    });

    it('should cross-file verify spec.md requirements against verify.md scenarios', async () => {
      const validator = new Validator();

      const specContent = `# Auth Specification

## Purpose
Authentication.

## Requirements

### Requirement: User Login
The system SHALL authenticate users.

### Requirement: Session Management
The system SHALL manage sessions.
`;

      const verifyContent = `# Verification Criteria

#### Scenario: User Login test
WHEN user logs in THEN session is created.

#### Scenario: Session Management check
WHEN session expires THEN user is logged out.
`;

      const issues = validator.crossFileVerify(specContent, verifyContent, {
        requirementPattern: '### Requirement: {name}',
        scenarioPattern: '#### Scenario: {name}',
      }, 'auth/spec.md');

      expect(issues).toHaveLength(0);
    });

    it('should report error when verify.md has no scenarios for a requirement', async () => {
      const validator = new Validator();

      const specContent = `## Requirements
### Requirement: User Login
The system SHALL authenticate users.
`;
      const verifyContent = `# Verification
No test cases defined yet.
`;

      const issues = validator.crossFileVerify(specContent, verifyContent, {
        requirementPattern: '### Requirement: {name}',
        scenarioPattern: '#### Scenario: {name}',
      }, 'auth/spec.md');

      expect(issues).toHaveLength(1);
      expect(issues[0].level).toBe('ERROR');
      expect(issues[0].message).toContain('User Login');
    });
  });

  // -----------------------------------------------------------------------
  // 9.3 — validations[] with scope and eachBlock granularity
  // -----------------------------------------------------------------------
  describe('validations[] scope and eachBlock integration (9.3)', () => {
    it('should validate file-level, scope-level, and eachBlock-level rules together', () => {
      const validator = new Validator();

      const content = `# API Specification

## Purpose
Define the public API endpoints.

## Endpoints

### Endpoint: GET /users
The API SHALL return a list of users.

#### Scenario: List all users
WHEN client sends GET /users THEN 200 with user list.

### Endpoint: POST /users
The API MUST create a new user.

#### Scenario: Create user
WHEN client sends POST /users with valid body THEN 201.

## Security
All endpoints require authentication.
`;

      const rules: ValidationRule[] = [
        // File-level: must have a Purpose section
        { pattern: '## Purpose', required: true },
        // Scope-level: Endpoints section must contain at least one endpoint pattern
        { pattern: '### Endpoint: {name}', required: true, scope: 'Endpoints' },
        // eachBlock-level: every ### block in Endpoints must have SHALL|MUST
        { pattern: 'SHALL|MUST', required: true, eachBlock: 'Endpoints' },
        // eachBlock-level: every ### block in Endpoints must have a scenario
        { pattern: '#### Scenario: {name}', required: true, eachBlock: 'Endpoints' },
      ];

      const issues = validator.validateContentRules(content, rules, 'api/spec.md');
      expect(issues).toHaveLength(0);
    });

    it('should detect violations at all three levels', () => {
      const validator = new Validator();

      const content = `# Spec

## Endpoints

### Endpoint: GET /users
The API returns users.

### Endpoint: POST /users
The API MUST create a user.

#### Scenario: Create user
WHEN POST THEN 201.
`;

      const rules: ValidationRule[] = [
        // File-level: must have Purpose section → FAIL (missing)
        { pattern: '## Purpose', required: true },
        // Scope-level: Security section must contain pattern → FAIL (section missing)
        { pattern: 'authentication', required: true, scope: 'Security' },
        // eachBlock in Endpoints: must have SHALL|MUST → FAIL for GET /users
        { pattern: 'SHALL|MUST', required: true, eachBlock: 'Endpoints' },
        // eachBlock in Endpoints: must have Scenario → FAIL for GET /users
        { pattern: '#### Scenario: {name}', required: true, eachBlock: 'Endpoints' },
      ];

      const issues = validator.validateContentRules(content, rules, 'api/spec.md');

      // 4 issues total:
      // 1. File-level: missing ## Purpose
      // 2. Scope-level: Section ## Security not found
      // 3. eachBlock: GET /users missing SHALL|MUST
      // 4. eachBlock: GET /users missing Scenario
      expect(issues).toHaveLength(4);

      const fileLevelIssue = issues.find(i => i.message.includes('## Purpose'));
      expect(fileLevelIssue).toBeDefined();
      expect(fileLevelIssue!.level).toBe('ERROR');

      const scopeIssue = issues.find(i => i.message.includes('Security') && i.message.includes('not found'));
      expect(scopeIssue).toBeDefined();

      const shallIssue = issues.find(i => i.message.includes('SHALL|MUST') && i.message.includes('GET /users'));
      expect(shallIssue).toBeDefined();

      const scenarioIssue = issues.find(i => i.message.includes('Scenario') && i.message.includes('GET /users'));
      expect(scenarioIssue).toBeDefined();
    });

    it('should emit warnings for non-required rules', () => {
      const validator = new Validator();

      const content = `## Endpoints
### Endpoint: GET /users
Returns users.
`;

      const rules: ValidationRule[] = [
        // Not required - should emit warnings, not errors
        { pattern: '## Purpose', required: false },
        { pattern: 'SHALL|MUST', required: false, eachBlock: 'Endpoints' },
      ];

      const issues = validator.validateContentRules(content, rules, 'test.md');
      expect(issues).toHaveLength(2);
      expect(issues.every(i => i.level === 'WARNING')).toBe(true);
      expect(issues[0].message).toContain('recommended');
      expect(issues[1].message).toContain('recommended');
    });

    it('should warn when eachBlock section has no ### blocks', () => {
      const validator = new Validator();

      const content = `## Requirements
Just some general text, no requirement blocks here.
`;

      const rules: ValidationRule[] = [
        { pattern: 'SHALL|MUST', required: true, eachBlock: 'Requirements' },
      ];

      const issues = validator.validateContentRules(content, rules, 'test.md');
      expect(issues).toHaveLength(1);
      expect(issues[0].level).toBe('WARNING');
      expect(issues[0].message).toContain('No ### blocks');
    });

    it('should use extractSectionContent and splitIntoBlocks correctly for complex docs', () => {
      const content = `# Spec

## Overview
Brief overview.

## Functional Requirements

### FR: Authentication
The system SHALL authenticate via OAuth2.

#### Scenario: OAuth flow
WHEN user initiates OAuth THEN redirect occurs.

### FR: Authorization
The system MUST enforce RBAC.

#### Scenario: Role check
WHEN user lacks role THEN 403 returned.

## Non-Functional Requirements

### NFR: Performance
The system SHALL respond within 200ms.

### NFR: Availability
The system SHALL maintain 99.9% uptime.

## Appendix
Additional notes.
`;

      // Extract Functional Requirements section
      const frSection = extractSectionContent(content, 'Functional Requirements');
      expect(frSection).toBeDefined();
      expect(frSection).toContain('### FR: Authentication');
      expect(frSection).toContain('### FR: Authorization');
      expect(frSection).not.toContain('### NFR: Performance');

      // Split into blocks
      const frBlocks = splitIntoBlocks(frSection!);
      expect(frBlocks).toHaveLength(2);
      expect(frBlocks[0].name).toBe('FR: Authentication');
      expect(frBlocks[1].name).toBe('FR: Authorization');

      // Extract Non-Functional Requirements
      const nfrSection = extractSectionContent(content, 'Non-Functional Requirements');
      expect(nfrSection).toBeDefined();
      const nfrBlocks = splitIntoBlocks(nfrSection!);
      expect(nfrBlocks).toHaveLength(2);
      expect(nfrBlocks[0].name).toBe('NFR: Performance');
      expect(nfrBlocks[1].name).toBe('NFR: Availability');
    });
  });

  // -----------------------------------------------------------------------
  // 9.7 — Delta merge with multiple delta sections per artifact
  // -----------------------------------------------------------------------
  describe('delta merge with multiple delta sections (9.7)', () => {
    it('should parse multiple delta sections from a single change file', () => {
      const content = `## ADDED Requirements

### Requirement: User Login
The system SHALL authenticate users via password.

#### Scenario: Valid credentials
WHEN user provides correct credentials THEN access is granted.

## ADDED Constraints

### Constraint: Password Length
The system SHALL enforce a minimum password length of 8 characters.

#### Scenario: Short password rejected
WHEN user enters a password with fewer than 8 characters THEN the system rejects it.
`;

      const deltaConfigs: DeltaConfig[] = [
        { section: 'Requirements', pattern: '### Requirement: {name}' },
        { section: 'Constraints', pattern: '### Constraint: {name}' },
      ];

      const result = parseDeltaSpecMulti(content, deltaConfigs);
      expect(result.sections).toHaveLength(2);

      const reqSection = result.sections.find(s => s.sectionName === 'Requirements')!;
      expect(reqSection.added).toHaveLength(1);
      expect(reqSection.added[0].name).toBe('User Login');
      expect(reqSection.sectionPresence.added).toBe(true);

      const constraintSection = result.sections.find(s => s.sectionName === 'Constraints')!;
      expect(constraintSection.added).toHaveLength(1);
      expect(constraintSection.added[0].name).toBe('Password Length');
      expect(constraintSection.sectionPresence.added).toBe(true);
    });

    it('should handle mixed operations across delta sections', () => {
      const content = `## ADDED Requirements

### Requirement: MFA
The system SHALL support multi-factor authentication.

#### Scenario: MFA enrollment
WHEN user enables MFA THEN TOTP secret is generated.

## MODIFIED Constraints

### Constraint: Password Length
The system SHALL enforce a minimum password length of 12 characters.

#### Scenario: Short password rejected
WHEN user enters a password with fewer than 12 characters THEN the system rejects it.

## REMOVED Constraints

- \`### Constraint: Legacy Encoding\`
`;

      const deltaConfigs: DeltaConfig[] = [
        { section: 'Requirements', pattern: '### Requirement: {name}' },
        { section: 'Constraints', pattern: '### Constraint: {name}' },
      ];

      const result = parseDeltaSpecMulti(content, deltaConfigs);

      const reqSection = result.sections.find(s => s.sectionName === 'Requirements')!;
      expect(reqSection.added).toHaveLength(1);
      expect(reqSection.modified).toHaveLength(0);
      expect(reqSection.removed).toHaveLength(0);

      const constraintSection = result.sections.find(s => s.sectionName === 'Constraints')!;
      expect(constraintSection.added).toHaveLength(0);
      expect(constraintSection.modified).toHaveLength(1);
      expect(constraintSection.modified[0].name).toBe('Password Length');
      expect(constraintSection.removed).toHaveLength(1);
      expect(constraintSection.removed[0]).toBe('Legacy Encoding');
    });

    it('should delta-merge one section while the other has no changes', () => {
      const content = `## ADDED Requirements

### Requirement: Audit Trail
The system SHALL log all administrative actions.

#### Scenario: Admin action logged
WHEN admin performs an action THEN it is recorded in the audit log.
`;

      const deltaConfigs: DeltaConfig[] = [
        { section: 'Requirements', pattern: '### Requirement: {name}' },
        { section: 'Constraints', pattern: '### Constraint: {name}' },
      ];

      const result = parseDeltaSpecMulti(content, deltaConfigs);

      const reqSection = result.sections.find(s => s.sectionName === 'Requirements')!;
      expect(reqSection.added).toHaveLength(1);

      const constraintSection = result.sections.find(s => s.sectionName === 'Constraints')!;
      expect(constraintSection.added).toHaveLength(0);
      expect(constraintSection.modified).toHaveLength(0);
      expect(constraintSection.removed).toHaveLength(0);
      expect(constraintSection.renamed).toHaveLength(0);
    });

    it('should apply multi-delta merge to existing spec using buildUpdatedSpec per section', async () => {
      const changeDir = path.join(tempDir, 'change');
      const mainSpecsDir = path.join(tempDir, 'specs');

      // Create existing target with two sections
      const targetDir = path.join(mainSpecsDir, 'auth');
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(
        path.join(targetDir, 'spec.md'),
        `# Auth Specification

## Purpose
Authentication and security constraints.

## Requirements

### Requirement: Session Management
The system SHALL manage user sessions.

#### Scenario: Session timeout
WHEN session expires THEN user is logged out.

## Constraints

### Constraint: Password Complexity
The system SHALL require uppercase and lowercase letters.

#### Scenario: Weak password
WHEN password has no uppercase THEN it is rejected.
`
      );

      // Create change spec with deltas for Requirements section
      const changeSpecDir = path.join(changeDir, 'specs', 'auth');
      await fs.mkdir(changeSpecDir, { recursive: true });
      await fs.writeFile(
        path.join(changeSpecDir, 'spec.md'),
        `## ADDED Requirements

### Requirement: User Login
The system SHALL authenticate users via password.

#### Scenario: Valid credentials
WHEN user provides correct credentials THEN access is granted.
`
      );

      const updates = await findSpecUpdates(changeDir, mainSpecsDir);
      const specUpdate = updates.find(u => path.basename(u.source) === 'spec.md')!;

      // Apply delta merge for Requirements section
      const result = await buildUpdatedSpec(specUpdate, 'test-change', {
        sectionName: 'Requirements',
        requirementPattern: '### Requirement: {name}',
      });

      expect(result.counts.added).toBe(1);
      expect(result.rebuilt).toContain('### Requirement: User Login');
      expect(result.rebuilt).toContain('### Requirement: Session Management');
      // The Constraints section should be preserved in the "after" portion
      expect(result.rebuilt).toContain('## Constraints');
      expect(result.rebuilt).toContain('### Constraint: Password Complexity');
    });

    it('should validate multi-delta change specs with validator', async () => {
      const changeDir = path.join(tempDir, 'change');

      // Create change spec with multi-delta content
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
WHEN password is under 8 chars THEN rejection.
`
      );

      const validator = new Validator();
      const report = await validator.validateChangeDeltaSpecs(changeDir, {
        deltaConfigs: [
          { section: 'Requirements', pattern: '### Requirement: {name}' },
          { section: 'Constraints', pattern: '### Constraint: {name}' },
        ],
        validationRules: [
          { pattern: '#### Scenario: {name}', required: true, eachBlock: 'Requirements' },
          { pattern: '#### Scenario: {name}', required: true, eachBlock: 'Constraints' },
          { pattern: 'SHALL|MUST', required: true, eachBlock: 'Requirements' },
          { pattern: 'SHALL|MUST', required: true, eachBlock: 'Constraints' },
        ],
      });

      expect(report.valid).toBe(true);
      expect(report.issues.filter(i => i.level === 'ERROR')).toHaveLength(0);
    });

    it('should detect validation errors across multiple delta sections', async () => {
      const changeDir = path.join(tempDir, 'change');

      const changeSpecDir = path.join(changeDir, 'specs', 'auth');
      await fs.mkdir(changeSpecDir, { recursive: true });
      await fs.writeFile(
        path.join(changeSpecDir, 'spec.md'),
        `## ADDED Requirements

### Requirement: User Login
The system SHALL authenticate users.

#### Scenario: Valid credentials
WHEN correct credentials THEN access granted.

## ADDED Constraints

### Constraint: No Normative
This constraint has no normative keyword.

#### Scenario: Test
WHEN something THEN something.
`
      );

      const validator = new Validator();
      const report = await validator.validateChangeDeltaSpecs(changeDir, {
        deltaConfigs: [
          { section: 'Requirements', pattern: '### Requirement: {name}' },
          { section: 'Constraints', pattern: '### Constraint: {name}' },
        ],
        validationRules: [
          { pattern: '#### Scenario: {name}', required: true, eachBlock: 'Requirements' },
          { pattern: '#### Scenario: {name}', required: true, eachBlock: 'Constraints' },
          { pattern: 'SHALL|MUST', required: true, eachBlock: 'Requirements' },
          { pattern: 'SHALL|MUST', required: true, eachBlock: 'Constraints' },
        ],
      });

      // The Constraints entry "No Normative" should fail the SHALL|MUST check
      const errors = report.issues.filter(i => i.level === 'ERROR');
      expect(errors.length).toBeGreaterThanOrEqual(1);
      const normativeError = errors.find(e => e.message.includes('No Normative') && e.message.includes('normative'));
      expect(normativeError).toBeDefined();
    });
  });
});
