import { describe, it, expect, vi } from 'vitest';
import path from 'path';

// Mock validateConfigPath to avoid filesystem reads in unit tests
vi.mock('../../src/utils/path-validation.js', () => ({
  validateConfigPath: vi.fn(),
}));

import { resolveSpecsPaths, DEFAULT_SPECS_PATH } from '../../src/utils/specs-path.js';
import { validateConfigPath } from '../../src/utils/path-validation.js';

describe('resolveSpecsPaths', () => {
  describe('default behavior', () => {
    it('should use default path when specsPath is undefined', () => {
      const result = resolveSpecsPaths('/project');
      expect(result.relativePosix).toBe('openspec/specs');
      expect(result.relative).toBe(path.join('openspec', 'specs'));
    });

    it('should export DEFAULT_SPECS_PATH constant', () => {
      expect(DEFAULT_SPECS_PATH).toBe('openspec/specs');
    });
  });

  describe('custom path resolution', () => {
    it('should resolve custom specsPath with forward slashes', () => {
      const result = resolveSpecsPaths('/project', 'docs/specs');
      expect(result.relativePosix).toBe('docs/specs');
      expect(result.relative).toBe(path.join('docs', 'specs'));
      expect(result.absolute).toBe(path.resolve('/project', 'docs', 'specs'));
    });

    it('should resolve single-segment path', () => {
      const result = resolveSpecsPaths('/project', 'specs');
      expect(result.relativePosix).toBe('specs');
      expect(result.relative).toBe('specs');
    });

    it('should resolve deeply nested path', () => {
      const result = resolveSpecsPaths('/project', 'docs/api/v2/specs');
      expect(result.relativePosix).toBe('docs/api/v2/specs');
      expect(result.relative).toBe(path.join('docs', 'api', 'v2', 'specs'));
    });
  });

  describe('cross-platform path handling', () => {
    it('should handle backslash input', () => {
      const result = resolveSpecsPaths('/project', 'docs\\specs');
      expect(result.relativePosix).toBe('docs/specs');
      expect(result.relative).toBe(path.join('docs', 'specs'));
    });

    it('should handle mixed separator input', () => {
      const result = resolveSpecsPaths('/project', 'docs/api\\specs');
      expect(result.relativePosix).toBe('docs/api/specs');
      expect(result.relative).toBe(path.join('docs', 'api', 'specs'));
    });

    it('should filter out empty segments from double separators', () => {
      const result = resolveSpecsPaths('/project', 'docs//specs');
      expect(result.relativePosix).toBe('docs/specs');
    });
  });

  describe('absolute path generation', () => {
    it('should generate correct absolute path on Unix-style root', () => {
      const result = resolveSpecsPaths('/home/user/project', 'docs/specs');
      expect(result.absolute).toBe(path.resolve('/home/user/project', 'docs', 'specs'));
    });

    it('should handle project root with trailing separator', () => {
      // path.resolve handles this correctly
      const result = resolveSpecsPaths('/project/', 'docs/specs');
      expect(result.absolute).toBe(path.resolve('/project/', 'docs', 'specs'));
    });
  });

  describe('edge cases', () => {
    it('should treat empty string specsPath as default', () => {
      const result = resolveSpecsPaths('/project', '');
      expect(result.relativePosix).toBe(DEFAULT_SPECS_PATH);
      expect(result.relative).toBe(path.join('openspec', 'specs'));
    });

    it('should treat whitespace-only specsPath as default', () => {
      const result = resolveSpecsPaths('/project', '   ');
      expect(result.relativePosix).toBe(DEFAULT_SPECS_PATH);
      expect(result.relative).toBe(path.join('openspec', 'specs'));
    });

    it('should handle leading separator in specsPath', () => {
      const result = resolveSpecsPaths('/project', '/docs/specs');
      // Leading slash creates empty first segment which gets filtered
      expect(result.relativePosix).toBe('docs/specs');
    });

    it('should handle trailing separator in specsPath', () => {
      const result = resolveSpecsPaths('/project', 'docs/specs/');
      // Trailing slash creates empty last segment which gets filtered
      expect(result.relativePosix).toBe('docs/specs');
    });
  });

  describe('path validation integration', () => {
    it('should call validateConfigPath with correct arguments', () => {
      const mockValidate = vi.mocked(validateConfigPath);
      mockValidate.mockClear();

      resolveSpecsPaths('/project', 'docs/specs');

      expect(mockValidate).toHaveBeenCalledOnce();
      expect(mockValidate).toHaveBeenCalledWith(
        path.resolve('/project', 'docs', 'specs'),
        '/project',
        {
          fieldName: 'specsPath',
          rawSegments: ['docs', 'specs'],
        }
      );
    });

    it('should call validateConfigPath with default path segments when specsPath is undefined', () => {
      const mockValidate = vi.mocked(validateConfigPath);
      mockValidate.mockClear();

      resolveSpecsPaths('/project');

      expect(mockValidate).toHaveBeenCalledWith(
        expect.any(String),
        '/project',
        {
          fieldName: 'specsPath',
          rawSegments: ['openspec', 'specs'],
        }
      );
    });
  });
});
