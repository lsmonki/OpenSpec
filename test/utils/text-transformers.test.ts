import { describe, it, expect } from 'vitest';
import {
  transformToHyphenCommands,
  composeTransformers,
  type TextTransformer,
} from '../../src/utils/command-references.js';
import { createSpecsPathTransformer } from '../../src/utils/specs-path.js';

describe('text transformers', () => {
  describe('createSpecsPathTransformer', () => {
    it('should replace {{specsPath}} placeholder with configured path', () => {
      const transformer = createSpecsPathTransformer('docs/specs');
      expect(transformer('Check {{specsPath}}/ for specs')).toBe('Check docs/specs/ for specs');
    });

    it('should replace multiple occurrences', () => {
      const transformer = createSpecsPathTransformer('custom/path');
      const input = '{{specsPath}}/auth and {{specsPath}}/api';
      expect(transformer(input)).toBe('custom/path/auth and custom/path/api');
    });

    it('should return text unchanged when no placeholder present', () => {
      const transformer = createSpecsPathTransformer('docs/specs');
      expect(transformer('No placeholders here')).toBe('No placeholders here');
    });

    it('should handle empty string path', () => {
      const transformer = createSpecsPathTransformer('');
      expect(transformer('{{specsPath}}/file.md')).toBe('/file.md');
    });

    it('should work with default path', () => {
      const transformer = createSpecsPathTransformer('openspec/specs');
      expect(transformer('Check {{specsPath}}/')).toBe('Check openspec/specs/');
    });
  });

  describe('composeTransformers', () => {
    it('should compose two transformers left-to-right', () => {
      const t1: TextTransformer = (text) => text.replace('A', 'B');
      const t2: TextTransformer = (text) => text.replace('B', 'C');
      const composed = composeTransformers(t1, t2);

      expect(composed?.('A')).toBe('C');
    });

    it('should compose multiple transformers', () => {
      const t1: TextTransformer = (text) => `[${text}]`;
      const t2: TextTransformer = (text) => `(${text})`;
      const t3: TextTransformer = (text) => `{${text}}`;
      const composed = composeTransformers(t1, t2, t3);

      expect(composed?.('x')).toBe('{([x])}');
    });

    it('should return undefined when no valid transformers provided', () => {
      expect(composeTransformers()).toBeUndefined();
      expect(composeTransformers(undefined)).toBeUndefined();
      expect(composeTransformers(undefined, undefined)).toBeUndefined();
    });

    it('should skip undefined transformers', () => {
      const t1: TextTransformer = (text) => text.toUpperCase();
      const composed = composeTransformers(undefined, t1, undefined);

      expect(composed?.('hello')).toBe('HELLO');
    });

    it('should return single transformer when only one is valid', () => {
      const t1: TextTransformer = (text) => text + '!';
      const composed = composeTransformers(t1);

      expect(composed?.('hello')).toBe('hello!');
    });
  });

  describe('specsPath + hyphen commands composition', () => {
    it('should correctly compose specsPath and hyphen transformers', () => {
      const specsPathTransformer = createSpecsPathTransformer('docs/specs');
      const composed = composeTransformers(specsPathTransformer, transformToHyphenCommands);

      const input = 'Check {{specsPath}}/ and use /opsx:apply to implement.';
      const expected = 'Check docs/specs/ and use /opsx-apply to implement.';

      expect(composed?.(input)).toBe(expected);
    });

    it('should handle skills with both placeholders and commands', () => {
      const specsPathTransformer = createSpecsPathTransformer('my-project/specifications');
      const composed = composeTransformers(specsPathTransformer, transformToHyphenCommands);

      const input = `
Look for existing specs in {{specsPath}}/<capability>/.
Use /opsx:new to create a new change.
Then run /opsx:continue to create the next artifact.
Delta specs go in {{specsPath}}/auth/ for the auth capability.
      `.trim();

      expect(composed?.(input)).toContain('my-project/specifications/<capability>/');
      expect(composed?.(input)).toContain('/opsx-new');
      expect(composed?.(input)).toContain('/opsx-continue');
      expect(composed?.(input)).toContain('my-project/specifications/auth/');
      expect(composed?.(input)).not.toContain('{{specsPath}}');
      expect(composed?.(input)).not.toContain('/opsx:');
    });

    it('should work with only specsPath transformer when no tool transformer needed', () => {
      const specsPathTransformer = createSpecsPathTransformer('docs/specs');
      const composed = composeTransformers(specsPathTransformer, undefined);

      const input = 'Check {{specsPath}}/ and use /opsx:apply to implement.';
      const expected = 'Check docs/specs/ and use /opsx:apply to implement.';

      expect(composed?.(input)).toBe(expected);
    });
  });
});
