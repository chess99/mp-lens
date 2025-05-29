import { isSafeClassExpression } from '../../src/commands/purgewxss/analyzeWxmlForPurge';

describe('isSafeClassExpression', () => {
  // Test cases for safe expressions
  describe('Safe Expressions', () => {
    it('should return true for simple single-quoted string literals', () => {
      expect(isSafeClassExpression("'some-class'")).toBe(true);
    });

    it('should return true for simple double-quoted string literals', () => {
      expect(isSafeClassExpression('"some-class"')).toBe(true);
    });

    it('should return true for empty string literals', () => {
      expect(isSafeClassExpression("''")).toBe(true);
      expect(isSafeClassExpression('""')).toBe(true);
    });

    it('should return true for string literals containing non-alphanumeric chars (but not + outside quotes)', () => {
      expect(isSafeClassExpression("'class-name_123'")).toBe(true);
      expect(isSafeClassExpression("'class.name.complex'")).toBe(true);
    });

    it('should return true for safe ternary operators with single quotes', () => {
      expect(isSafeClassExpression("condition ? 'class-a' : 'class-b'")).toBe(true);
    });

    it('should return true for safe ternary operators with double quotes', () => {
      expect(isSafeClassExpression('condition ? "class-a" : "class-b"')).toBe(true);
    });

    it('should return true for safe ternary operators with mixed quotes', () => {
      expect(isSafeClassExpression('condition ? "class-a" : \'class-b\'')).toBe(true);
    });

    it('should return true for safe ternary operators with empty strings', () => {
      expect(isSafeClassExpression("isValid ? 'active' : ''")).toBe(true);
      expect(isSafeClassExpression('isValid ? \'\' : "active"')).toBe(true);
    });

    it('should return true for ternary operators with complex conditions', () => {
      expect(isSafeClassExpression("obj.prop === 10 ? 'class-a' : 'class-b'")).toBe(true);
      expect(isSafeClassExpression("funcCall(value) ? 'class-a' : 'class-b'")).toBe(true);
    });

    it('should return true for simple variable access', () => {
      expect(isSafeClassExpression('myClass')).toBe(true);
    });

    it('should return true for object property access', () => {
      expect(isSafeClassExpression('styles.active')).toBe(true);
    });

    it('should return true for array element access', () => {
      expect(isSafeClassExpression('classes[0]')).toBe(true);
    });

    it('should return true for expressions with only whitespace (trimmed to empty, then not matching +)', () => {
      expect(isSafeClassExpression('   ')).toBe(true);
    });

    it('should return true for an empty string input', () => {
      expect(isSafeClassExpression('')).toBe(true);
    });

    it('should return true for literals containing a plus symbol within the string', () => {
      expect(isSafeClassExpression("'class+plus'")).toBe(true);
      expect(isSafeClassExpression('"text+with+plus"')).toBe(true);
      expect(isSafeClassExpression("isTrue ? 'option+A' : 'option+B'")).toBe(true);
    });
  });

  // Test cases for unsafe (risky) expressions
  describe('Unsafe (Risky) Expressions', () => {
    it('should return false for string concatenation with +', () => {
      expect(isSafeClassExpression("'prefix-' + variableName")).toBe(false);
    });

    it('should return false for variable + string literal', () => {
      expect(isSafeClassExpression("variableName + '-suffix'")).toBe(false);
    });

    it('should return false for variable + variable', () => {
      expect(isSafeClassExpression('var1 + var2')).toBe(false);
    });

    it('should return false for multiple concatenations', () => {
      expect(isSafeClassExpression("'class-' + type + '-' + size")).toBe(false);
    });

    it('should return false for concatenation inside a ternary (if not part of the resulting literal)', () => {
      // This case is tricky. The current regex for ternary focuses on literals as results.
      // If `+` is in the condition part, it might be fine. If `+` is part of constructing the result *outside* a literal, it is risky.
      // e.g. condition ? 'class-' + mode : 'other' --> The ternary regex won't match 'class-' + mode as a simple literal.
      // Then it will fall through and `.includes('+')` will catch it.
      expect(isSafeClassExpression("isMode ? 'prefix-' + mode : 'default'")).toBe(false);
      expect(isSafeClassExpression("isMode ? someVar + 'suffix' : 'default'")).toBe(false);
      expect(isSafeClassExpression("isMode ? 'default' : 'prefix-' + mode")).toBe(false);
      expect(isSafeClassExpression("isMode ? 'default' : someVar + 'suffix'")).toBe(false);
    });

    it('should return false even if parts of the concatenation are complex', () => {
      expect(isSafeClassExpression("'base-' + obj.prop + '--' + arr[0]")).toBe(false);
    });

    it('should handle spaces around +', () => {
      expect(isSafeClassExpression("  'prefix-'  +  variableName  ")).toBe(false);
    });
  });
});
