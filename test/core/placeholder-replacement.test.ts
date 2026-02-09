import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  replacePlaceholders,
  replaceLegacySpecsPath,
  _resetWarningState,
} from '../../src/core/artifact-graph/instruction-loader.js';

describe('placeholder replacement', () => {
  beforeEach(() => {
    _resetWarningState();
  });

  describe('replacePlaceholders', () => {
    it('should replace single placeholder', () => {
      const text = 'Check {{specsPath}}/ for specs';
      const placeholders = new Map([['specsPath', 'docs/specs']]);
      expect(replacePlaceholders(text, placeholders)).toBe('Check docs/specs/ for specs');
    });

    it('should replace multiple occurrences of same placeholder', () => {
      const text = '{{specsPath}}/auth and {{specsPath}}/api';
      const placeholders = new Map([['specsPath', 'docs/specs']]);
      expect(replacePlaceholders(text, placeholders)).toBe('docs/specs/auth and docs/specs/api');
    });

    it('should replace multiple different placeholders', () => {
      const text = '{{specsPath}} with {{projectName}}';
      const placeholders = new Map([
        ['specsPath', 'docs/specs'],
        ['projectName', 'my-project'],
      ]);
      expect(replacePlaceholders(text, placeholders)).toBe('docs/specs with my-project');
    });

    it('should return text unchanged when no placeholders match', () => {
      const text = 'No placeholders here';
      const placeholders = new Map([['specsPath', 'docs/specs']]);
      expect(replacePlaceholders(text, placeholders)).toBe('No placeholders here');
    });

    it('should handle empty placeholder map', () => {
      const text = '{{specsPath}} stays unchanged';
      const placeholders = new Map<string, string>();
      expect(replacePlaceholders(text, placeholders)).toBe('{{specsPath}} stays unchanged');
    });

    it('should handle empty text', () => {
      const text = '';
      const placeholders = new Map([['specsPath', 'docs/specs']]);
      expect(replacePlaceholders(text, placeholders)).toBe('');
    });
  });

  describe('replaceLegacySpecsPath', () => {
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it('should replace hardcoded openspec/specs with configured path', () => {
      const text = 'Check openspec/specs/ for specs';
      const result = replaceLegacySpecsPath(text, 'docs/specs', true);
      expect(result).toBe('Check docs/specs/ for specs');
    });

    it('should not replace when specsPath is default', () => {
      const text = 'Check openspec/specs/ for specs';
      const result = replaceLegacySpecsPath(text, 'openspec/specs', true);
      expect(result).toBe('Check openspec/specs/ for specs');
    });

    it('should not warn for built-in schemas', () => {
      replaceLegacySpecsPath('openspec/specs', 'docs/specs', true, '/path/schema.yaml');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should warn for custom schemas', () => {
      replaceLegacySpecsPath('openspec/specs', 'docs/specs', false, '/path/custom/schema.yaml');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('hardcoded')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('{{specsPath}}')
      );
    });

    it('should only warn once per source file', () => {
      // First call should warn
      replaceLegacySpecsPath('openspec/specs', 'docs/specs', false, '/unique/file1.yaml');
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);

      // Second call with same file should not warn again
      replaceLegacySpecsPath('openspec/specs', 'docs/specs', false, '/unique/file1.yaml');
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);

      // Third call with different file should warn
      replaceLegacySpecsPath('openspec/specs', 'docs/specs', false, '/unique/file2.yaml');
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
    });

    it('should not warn when no legacy path found', () => {
      replaceLegacySpecsPath('Check {{specsPath}}/', 'docs/specs', false, '/path/schema.yaml');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should replace multiple occurrences', () => {
      const text = 'openspec/specs/auth and openspec/specs/api';
      const result = replaceLegacySpecsPath(text, 'docs/specs', true);
      expect(result).toBe('docs/specs/auth and docs/specs/api');
    });
  });
});
