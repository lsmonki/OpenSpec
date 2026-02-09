import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

describe('specsPath integration', () => {
  const projectRoot = process.cwd();
  const testDir = path.join(projectRoot, 'test-specs-path-integration-tmp');
  const openspecBin = path.join(projectRoot, 'bin', 'openspec.js');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('CLI commands with custom specsPath', () => {
    it('should use custom specsPath from config for spec list', async () => {
      // Setup: custom specsPath in config
      const customSpecsDir = path.join(testDir, 'docs', 'specifications');
      const openspecDir = path.join(testDir, 'openspec');

      await fs.mkdir(openspecDir, { recursive: true });
      await fs.mkdir(customSpecsDir, { recursive: true });
      await fs.mkdir(path.join(customSpecsDir, 'auth'), { recursive: true });

      // Create config with custom specsPath
      await fs.writeFile(
        path.join(openspecDir, 'config.yaml'),
        `schema: spec-driven\nspecsPath: docs/specifications\n`
      );

      // Create a spec file in custom location
      await fs.writeFile(
        path.join(customSpecsDir, 'auth', 'spec.md'),
        '## Purpose\nAuth specification\n\n## Requirements\n\n### Requirement: Login\nShall support login.'
      );

      const originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        const output = execSync(`node ${openspecBin} spec list`, {
          encoding: 'utf-8',
        });

        expect(output).toContain('auth');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should use custom specsPath for spec show', async () => {
      const customSpecsDir = path.join(testDir, 'my', 'custom', 'specs');
      const openspecDir = path.join(testDir, 'openspec');

      await fs.mkdir(openspecDir, { recursive: true });
      await fs.mkdir(path.join(customSpecsDir, 'payment'), { recursive: true });

      await fs.writeFile(
        path.join(openspecDir, 'config.yaml'),
        `specsPath: my/custom/specs\n`
      );

      const specContent = `## Purpose
Payment processing specification.

## Requirements

### Requirement: Process Payment
The system SHALL process payments securely.

#### Scenario: Successful payment
- **WHEN** user submits valid payment
- **THEN** payment is processed`;

      await fs.writeFile(
        path.join(customSpecsDir, 'payment', 'spec.md'),
        specContent
      );

      const originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        const output = execSync(`node ${openspecBin} spec show payment`, {
          encoding: 'utf-8',
        });

        expect(output).toContain('Payment processing specification');
        expect(output).toContain('Process Payment');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should use custom specsPath for validate command', async () => {
      const customSpecsDir = path.join(testDir, 'docs', 'specs');
      const openspecDir = path.join(testDir, 'openspec');

      await fs.mkdir(openspecDir, { recursive: true });
      await fs.mkdir(path.join(customSpecsDir, 'api'), { recursive: true });

      await fs.writeFile(
        path.join(openspecDir, 'config.yaml'),
        `specsPath: docs/specs\n`
      );

      // Valid spec with requirement and scenario
      await fs.writeFile(
        path.join(customSpecsDir, 'api', 'spec.md'),
        `## Purpose
API specification.

## Requirements

### Requirement: API Endpoint
The system SHALL expose a REST API.

#### Scenario: GET request
- **WHEN** client sends GET request
- **THEN** server responds with data`
      );

      const originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        // Validate a specific spec by name
        const output = execSync(`node ${openspecBin} validate api`, {
          encoding: 'utf-8',
        });

        expect(output).toContain('api');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should fall back to default specsPath when not configured', async () => {
      // Default location
      const defaultSpecsDir = path.join(testDir, 'openspec', 'specs');
      const openspecDir = path.join(testDir, 'openspec');

      await fs.mkdir(openspecDir, { recursive: true });
      await fs.mkdir(path.join(defaultSpecsDir, 'default-test'), { recursive: true });

      // Config without specsPath
      await fs.writeFile(
        path.join(openspecDir, 'config.yaml'),
        `schema: spec-driven\n`
      );

      await fs.writeFile(
        path.join(defaultSpecsDir, 'default-test', 'spec.md'),
        '## Purpose\nDefault location test.\n\n## Requirements\n\n### Requirement: Test\nTest requirement.'
      );

      const originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        const output = execSync(`node ${openspecBin} spec list`, {
          encoding: 'utf-8',
        });

        expect(output).toContain('default-test');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('path format handling', () => {
    it('should accept forward slashes in specsPath', async () => {
      const openspecDir = path.join(testDir, 'openspec');
      const customSpecsDir = path.join(testDir, 'docs', 'specs');

      await fs.mkdir(openspecDir, { recursive: true });
      await fs.mkdir(path.join(customSpecsDir, 'test'), { recursive: true });

      await fs.writeFile(
        path.join(openspecDir, 'config.yaml'),
        `specsPath: docs/specs\n`
      );

      await fs.writeFile(
        path.join(customSpecsDir, 'test', 'spec.md'),
        '## Purpose\nTest.\n\n## Requirements\n\n### Requirement: R1\nR1 desc.'
      );

      const originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        const output = execSync(`node ${openspecBin} spec list`, {
          encoding: 'utf-8',
        });

        expect(output).toContain('test');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
