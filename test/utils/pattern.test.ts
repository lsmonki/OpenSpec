import { describe, it, expect } from 'vitest';
import { patternToRegex, extractNameFromPattern } from '../../src/utils/pattern.js';

describe('utils/pattern', () => {
  describe('patternToRegex', () => {
    it('should convert requirement pattern to regex', () => {
      const regex = patternToRegex('### Requirement: {name}');
      expect('### Requirement: User login').toMatch(regex);
      expect('### Requirement: ').not.toMatch(regex); // name cannot be empty
    });

    it('should convert scenario pattern to regex', () => {
      const regex = patternToRegex('#### Scenario: {name}');
      expect('#### Scenario: Valid input').toMatch(regex);
      expect('### Scenario: Wrong level').not.toMatch(regex);
    });

    it('should convert custom pattern with different format', () => {
      const regex = patternToRegex('## RF-{name}:');
      expect('## RF-001:').toMatch(regex);
      expect('## RF-user-login:').toMatch(regex);
    });

    it('should escape regex special characters', () => {
      const regex = patternToRegex('### [Req]: {name}');
      expect('### [Req]: Something').toMatch(regex);
      expect('### Req: Something').not.toMatch(regex); // brackets are literal
    });

    it('should handle patterns with parentheses', () => {
      const regex = patternToRegex('### (Req) {name}');
      expect('### (Req) Something').toMatch(regex);
      expect('### Req Something').not.toMatch(regex);
    });

    it('should handle patterns with dots', () => {
      const regex = patternToRegex('### Req. {name}');
      expect('### Req. Something').toMatch(regex);
      expect('### ReqX Something').not.toMatch(regex); // dot is literal
    });

    it('should capture the name', () => {
      const regex = patternToRegex('### Requirement: {name}');
      const match = '### Requirement: User login'.match(regex);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('User login');
    });

    it('should match from start of line only', () => {
      const regex = patternToRegex('### Requirement: {name}');
      expect('Some text ### Requirement: X'.match(regex)).toBeNull();
    });
  });

  describe('extractNameFromPattern', () => {
    it('should extract name from requirement pattern', () => {
      const name = extractNameFromPattern('### Requirement: User login', '### Requirement: {name}');
      expect(name).toBe('User login');
    });

    it('should extract name from scenario pattern', () => {
      const name = extractNameFromPattern('#### Scenario: Valid input', '#### Scenario: {name}');
      expect(name).toBe('Valid input');
    });

    it('should extract name from custom pattern', () => {
      const name = extractNameFromPattern('## RF-001:', '## RF-{name}:');
      expect(name).toBe('001');
    });

    it('should return null for non-matching text', () => {
      const name = extractNameFromPattern('### Not a requirement', '### Requirement: {name}');
      expect(name).toBeNull();
    });

    it('should handle names with special characters', () => {
      const name = extractNameFromPattern(
        '### Requirement: User can export (CSV)',
        '### Requirement: {name}'
      );
      expect(name).toBe('User can export (CSV)');
    });
  });
});
