import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Validator } from '../../src/core/validation/validator.ts';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('shallMustPattern configuration', () => {
  const specContent = `# Test Spec

## Purpose
This spec tests the shallMustPattern option.

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

  it('should fail with default pattern (no SHALL/MUST)', async () => {
    const validator = new Validator();
    const result = await validator.validateSpec(specPath);
    expect(result.valid).toBe(false);
    // Message includes the pattern used
    expect(result.issues.some(i => i.message.includes('SHALL|MUST'))).toBe(true);
  });

  it('should pass when shallMustPattern is null', async () => {
    const validator = new Validator();
    const result = await validator.validateSpec(specPath, { shallMustPattern: null });
    expect(result.valid).toBe(true);
  });

  it('should pass when shallMustPattern is empty string', async () => {
    const validator = new Validator();
    const result = await validator.validateSpec(specPath, { shallMustPattern: '' });
    expect(result.valid).toBe(true);
  });

  it('should pass with custom pattern matching "should"', async () => {
    const validator = new Validator();
    const result = await validator.validateSpec(specPath, { shallMustPattern: '[Ss]hould' });
    expect(result.valid).toBe(true);
  });
});
