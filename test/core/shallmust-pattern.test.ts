import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Validator } from '../../src/core/validation/validator.ts';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('shallMustPattern via validationRules eachBlock', () => {
  const specContent = `# Test Spec

## Purpose
This spec tests the shallMustPattern option via validationRules.

## Requirements

### Requirement: Test case sensitivity
The system should work correctly with lowercase.

#### Scenario: Basic test
- **WHEN** testing
- **THEN** it works
`;

  let tmpDir: string;
  let specPath: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shallMustTest-'));
    specPath = path.join(tmpDir, 'spec.md');
    fs.writeFileSync(specPath, specContent);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should fail with default validationRules (no SHALL/MUST in text)', async () => {
    const validator = new Validator();
    // Default validationRules include eachBlock 'SHALL|MUST' on Requirements
    const result = await validator.validateSpec(specPath, {
      validationRules: [
        { pattern: '## Purpose', required: true },
        { pattern: '## Requirements', required: true },
        { pattern: '#### Scenario: {name}', required: true, eachBlock: 'Requirements' },
        { pattern: 'SHALL|MUST', required: true, eachBlock: 'Requirements' },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.message.includes('SHALL|MUST'))).toBe(true);
  });

  it('should pass when no normative rule is configured', async () => {
    const validator = new Validator();
    // No SHALL|MUST rule in validationRules
    const result = await validator.validateSpec(specPath, {
      validationRules: [
        { pattern: '## Purpose', required: true },
        { pattern: '## Requirements', required: true },
        { pattern: '#### Scenario: {name}', required: true, eachBlock: 'Requirements' },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it('should pass with custom normative pattern matching "should"', async () => {
    const validator = new Validator();
    const result = await validator.validateSpec(specPath, {
      validationRules: [
        { pattern: '## Purpose', required: true },
        { pattern: '## Requirements', required: true },
        { pattern: '#### Scenario: {name}', required: true, eachBlock: 'Requirements' },
        { pattern: '[Ss]hould', required: true, eachBlock: 'Requirements' },
      ],
    });
    expect(result.valid).toBe(true);
  });
});
