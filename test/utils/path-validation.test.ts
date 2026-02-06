import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import {
  validateConfigPath,
  MAX_PARENT_TRAVERSAL,
  DENIED_PREFIXES,
  _resetWarnings,
} from '../../src/utils/path-validation.js';

// Mock readProjectConfig to avoid filesystem reads in unit tests
vi.mock('../../src/core/project-config.js', () => ({
  readProjectConfig: vi.fn(() => null),
}));

describe('validateConfigPath', () => {
  beforeEach(() => {
    _resetWarnings();
    vi.restoreAllMocks();
  });

  describe('depth limit', () => {
    it('should allow path with 3 parent traversals', () => {
      const segments = ['..', '..', '..', 'specs'];
      const absolute = path.resolve('/project', ...segments);

      // Use allowExternal override to bypass containment check
      expect(() =>
        validateConfigPath(absolute, '/project', {
          fieldName: 'specsPath',
          rawSegments: segments,
          allowExternal: true,
        })
      ).not.toThrow();
    });

    it('should reject path with 4 parent traversals', () => {
      const segments = ['..', '..', '..', '..', 'specs'];
      const absolute = path.resolve('/project', ...segments);

      expect(() =>
        validateConfigPath(absolute, '/project', {
          fieldName: 'specsPath',
          rawSegments: segments,
        })
      ).toThrow(/specsPath contains 4 '\.\.' segments, maximum is 3/);
    });

    it('should count scattered parent traversals', () => {
      const segments = ['a', '..', 'b', '..', 'c', '..', '..'];
      const absolute = path.resolve('/project', ...segments);

      expect(() =>
        validateConfigPath(absolute, '/project', {
          fieldName: 'specsPath',
          rawSegments: segments,
        })
      ).toThrow(/specsPath contains 4 '\.\.' segments, maximum is 3/);
    });

    it('should use fieldName in error message', () => {
      const segments = ['..', '..', '..', '..', 'specs'];
      const absolute = path.resolve('/project', ...segments);

      expect(() =>
        validateConfigPath(absolute, '/project', {
          fieldName: 'changesPath',
          rawSegments: segments,
        })
      ).toThrow(/changesPath contains 4/);
    });

    it('should export MAX_PARENT_TRAVERSAL as 3', () => {
      expect(MAX_PARENT_TRAVERSAL).toBe(3);
    });
  });

  describe('system directory denylist', () => {
    // These tests are platform-dependent — only run denylist checks for current platform
    const platform = process.platform;
    const currentPrefixes = DENIED_PREFIXES[platform] ?? [];

    if (platform === 'linux' || platform === 'darwin') {
      it('should reject path resolving to /etc', () => {
        expect(() =>
          validateConfigPath('/etc/openspec', '/project', {
            fieldName: 'specsPath',
            rawSegments: ['..', 'etc', 'openspec'],
            allowExternal: true,
          })
        ).toThrow(/protected system directory.*\/etc/);
      });

      it('should reject path resolving to /usr', () => {
        expect(() =>
          validateConfigPath('/usr/share/specs', '/project', {
            fieldName: 'specsPath',
            rawSegments: ['..', 'usr', 'share', 'specs'],
            allowExternal: true,
          })
        ).toThrow(/protected system directory/);
      });

      it('should not reject /var paths (used by temp directories)', () => {
        expect(() =>
          validateConfigPath('/var/folders/test/specs', '/project', {
            fieldName: 'specsPath',
            rawSegments: ['..', 'var', 'folders', 'test', 'specs'],
            allowExternal: true,
          })
        ).not.toThrow();
      });

      it('should not reject path outside denylist', () => {
        expect(() =>
          validateConfigPath('/home/user/shared-specs', '/project', {
            fieldName: 'specsPath',
            rawSegments: ['..', 'home', 'user', 'shared-specs'],
            allowExternal: true,
          })
        ).not.toThrow();
      });
    }

    if (platform === 'darwin') {
      it('should reject path resolving to /System', () => {
        expect(() =>
          validateConfigPath('/System/Library/specs', '/project', {
            fieldName: 'specsPath',
            rawSegments: ['..', 'System', 'Library', 'specs'],
            allowExternal: true,
          })
        ).toThrow(/protected system directory/);
      });
    }

    it('should only check prefixes for current platform', () => {
      // A path that looks like a Windows system dir should not be blocked on Unix (and vice versa)
      if (platform !== 'win32') {
        expect(() =>
          validateConfigPath('/project/C:\\Windows/test', '/project', {
            fieldName: 'specsPath',
            rawSegments: ['C:\\Windows', 'test'],
          })
        ).not.toThrow();
      }
    });

    it('should export DENIED_PREFIXES with entries for linux, darwin, win32', () => {
      expect(DENIED_PREFIXES).toHaveProperty('linux');
      expect(DENIED_PREFIXES).toHaveProperty('darwin');
      expect(DENIED_PREFIXES).toHaveProperty('win32');
      expect(DENIED_PREFIXES.linux.length).toBeGreaterThan(0);
      expect(DENIED_PREFIXES.darwin.length).toBeGreaterThan(0);
      expect(DENIED_PREFIXES.win32.length).toBeGreaterThan(0);
    });
  });

  describe('root containment', () => {
    it('should not throw when path is inside project root', () => {
      const absolute = path.resolve('/project', 'docs', 'specs');

      expect(() =>
        validateConfigPath(absolute, '/project', {
          fieldName: 'specsPath',
          rawSegments: ['docs', 'specs'],
        })
      ).not.toThrow();
    });

    it('should throw when path is outside root and allowExternal is false', () => {
      const absolute = path.resolve('/project', '..', 'outside');

      expect(() =>
        validateConfigPath(absolute, '/project', {
          fieldName: 'specsPath',
          rawSegments: ['..', 'outside'],
          allowExternal: false,
        })
      ).toThrow(/resolves outside project root/);
    });

    it('should suggest allowExternalPaths in error message', () => {
      const absolute = path.resolve('/project', '..', 'outside');

      expect(() =>
        validateConfigPath(absolute, '/project', {
          fieldName: 'specsPath',
          rawSegments: ['..', 'outside'],
          allowExternal: false,
        })
      ).toThrow(/allowExternalPaths: true/);
    });

    it('should warn but not throw when outside root and allowExternal is true', () => {
      const absolute = path.resolve('/project', '..', 'shared-specs');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() =>
        validateConfigPath(absolute, '/project', {
          fieldName: 'specsPath',
          rawSegments: ['..', 'shared-specs'],
          allowExternal: true,
        })
      ).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('outside the project root')
      );
    });

    it('should warn only once per fieldName', () => {
      const absolute = path.resolve('/project', '..', 'shared-specs');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      validateConfigPath(absolute, '/project', {
        fieldName: 'specsPath',
        rawSegments: ['..', 'shared-specs'],
        allowExternal: true,
      });
      validateConfigPath(absolute, '/project', {
        fieldName: 'specsPath',
        rawSegments: ['..', 'shared-specs'],
        allowExternal: true,
      });

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('should warn independently per fieldName', () => {
      const absolute = path.resolve('/project', '..', 'shared');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      validateConfigPath(absolute, '/project', {
        fieldName: 'specsPath',
        rawSegments: ['..', 'shared'],
        allowExternal: true,
      });
      validateConfigPath(absolute, '/project', {
        fieldName: 'changesPath',
        rawSegments: ['..', 'shared'],
        allowExternal: true,
      });

      expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    it('should not warn when path is inside root even with allowExternal true', () => {
      const absolute = path.resolve('/project', 'docs', 'specs');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      validateConfigPath(absolute, '/project', {
        fieldName: 'specsPath',
        rawSegments: ['docs', 'specs'],
        allowExternal: true,
      });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should read config when allowExternal is not provided', () => {
      const absolute = path.resolve('/project', '..', 'outside');

      // Mock returns null (no config = allowExternalPaths defaults to false)
      expect(() =>
        validateConfigPath(absolute, '/project', {
          fieldName: 'specsPath',
          rawSegments: ['..', 'outside'],
        })
      ).toThrow(/resolves outside project root/);
    });
  });

  describe('validation order', () => {
    it('should check depth before denylist', () => {
      // 4 '..' segments targeting /etc — should get depth error, not denylist error
      const segments = ['..', '..', '..', '..', 'etc', 'specs'];
      const absolute = path.resolve('/project/deep/nested', ...segments);

      expect(() =>
        validateConfigPath(absolute, '/project/deep/nested', {
          fieldName: 'specsPath',
          rawSegments: segments,
        })
      ).toThrow(/contains 4 '\.\.' segments/);
    });

    it('should check denylist before containment', () => {
      // 2 '..' targeting /etc — should get denylist error, not containment error
      if (process.platform === 'linux' || process.platform === 'darwin') {
        expect(() =>
          validateConfigPath('/etc/specs', '/project', {
            fieldName: 'specsPath',
            rawSegments: ['..', '..', 'etc', 'specs'],
            allowExternal: true,
          })
        ).toThrow(/protected system directory/);
      }
    });
  });
});
