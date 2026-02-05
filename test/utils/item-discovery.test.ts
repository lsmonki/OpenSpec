import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { getSpecIds, getActiveChangeIds } from '../../src/utils/item-discovery.js';

describe('item-discovery', () => {
  const testDir = path.join(process.cwd(), 'test-discovery-tmp');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('getSpecIds', () => {
    it('should return spec IDs with default spec.md requirement', async () => {
      const specsDir = path.join(testDir, 'openspec', 'specs');
      await fs.mkdir(path.join(specsDir, 'user-auth'), { recursive: true });
      await fs.mkdir(path.join(specsDir, 'api-endpoints'), { recursive: true });
      await fs.writeFile(path.join(specsDir, 'user-auth', 'spec.md'), '# Spec');
      await fs.writeFile(path.join(specsDir, 'api-endpoints', 'spec.md'), '# Spec');

      const ids = await getSpecIds(testDir);
      expect(ids).toEqual(['api-endpoints', 'user-auth']);
    });

    it('should skip directories without spec.md', async () => {
      const specsDir = path.join(testDir, 'openspec', 'specs');
      await fs.mkdir(path.join(specsDir, 'has-spec'), { recursive: true });
      await fs.mkdir(path.join(specsDir, 'no-spec'), { recursive: true });
      await fs.writeFile(path.join(specsDir, 'has-spec', 'spec.md'), '# Spec');
      await fs.writeFile(path.join(specsDir, 'no-spec', 'README.md'), '# Readme');

      const ids = await getSpecIds(testDir);
      expect(ids).toEqual(['has-spec']);
    });

    it('should support custom required files', async () => {
      const specsDir = path.join(testDir, 'openspec', 'specs');
      await fs.mkdir(path.join(specsDir, 'complete-spec'), { recursive: true });
      await fs.mkdir(path.join(specsDir, 'partial-spec'), { recursive: true });

      // complete-spec has both required files
      await fs.writeFile(path.join(specsDir, 'complete-spec', 'spec.md'), '# Spec');
      await fs.writeFile(path.join(specsDir, 'complete-spec', 'verify.md'), '# Verify');

      // partial-spec only has spec.md
      await fs.writeFile(path.join(specsDir, 'partial-spec', 'spec.md'), '# Spec');

      const config = { requiredFiles: ['spec.md', 'verify.md'] };
      const ids = await getSpecIds(testDir, config);
      expect(ids).toEqual(['complete-spec']);
    });

    it('should return empty array when specs directory does not exist', async () => {
      const ids = await getSpecIds(testDir);
      expect(ids).toEqual([]);
    });

    it('should skip hidden directories', async () => {
      const specsDir = path.join(testDir, 'openspec', 'specs');
      await fs.mkdir(path.join(specsDir, '.hidden'), { recursive: true });
      await fs.mkdir(path.join(specsDir, 'visible'), { recursive: true });
      await fs.writeFile(path.join(specsDir, '.hidden', 'spec.md'), '# Spec');
      await fs.writeFile(path.join(specsDir, 'visible', 'spec.md'), '# Spec');

      const ids = await getSpecIds(testDir);
      expect(ids).toEqual(['visible']);
    });
  });

  describe('getActiveChangeIds', () => {
    it('should return change IDs with proposal.md', async () => {
      const changesDir = path.join(testDir, 'openspec', 'changes');
      await fs.mkdir(path.join(changesDir, 'add-auth'), { recursive: true });
      await fs.mkdir(path.join(changesDir, 'fix-bug'), { recursive: true });
      await fs.writeFile(path.join(changesDir, 'add-auth', 'proposal.md'), '# Proposal');
      await fs.writeFile(path.join(changesDir, 'fix-bug', 'proposal.md'), '# Proposal');

      const ids = await getActiveChangeIds(testDir);
      expect(ids).toEqual(['add-auth', 'fix-bug']);
    });

    it('should skip archive directory', async () => {
      const changesDir = path.join(testDir, 'openspec', 'changes');
      await fs.mkdir(path.join(changesDir, 'active'), { recursive: true });
      await fs.mkdir(path.join(changesDir, 'archive', 'old'), { recursive: true });
      await fs.writeFile(path.join(changesDir, 'active', 'proposal.md'), '# Proposal');
      await fs.writeFile(path.join(changesDir, 'archive', 'old', 'proposal.md'), '# Proposal');

      const ids = await getActiveChangeIds(testDir);
      expect(ids).toEqual(['active']);
    });
  });
});
