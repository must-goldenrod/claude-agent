import { describe, it, expect } from 'vitest';
import { validateAgentName, safePath, validateFiniteNumber, validateScore } from '../src/sanitize.js';
import path from 'path';

describe('validateAgentName', () => {
  it('accepts valid names', () => {
    expect(validateAgentName('security-auditor')).toBe('security-auditor');
    expect(validateAgentName('code-reviewer-impl')).toBe('code-reviewer-impl');
    expect(validateAgentName('a1.test_agent')).toBe('a1.test_agent');
  });

  it('rejects path traversal attempts', () => {
    expect(() => validateAgentName('../../etc/passwd')).toThrow('Invalid agent name');
    expect(() => validateAgentName('../.claude/agents/evil')).toThrow('Invalid agent name');
  });

  it('rejects empty and invalid names', () => {
    expect(() => validateAgentName('')).toThrow('Invalid agent name');
    expect(() => validateAgentName('-starts-with-dash')).toThrow('Invalid agent name');
    expect(() => validateAgentName('Has Spaces')).toThrow('Invalid agent name');
    expect(() => validateAgentName('UPPERCASE')).toThrow('Invalid agent name');
  });

  it('rejects names over 64 chars', () => {
    expect(() => validateAgentName('a'.repeat(65))).toThrow('Invalid agent name');
  });
});

describe('safePath', () => {
  it('allows paths within base directory', () => {
    const base = '/tmp/registry/agents';
    expect(safePath(base, 'my-agent')).toBe(path.resolve(base, 'my-agent'));
  });

  it('blocks path traversal', () => {
    const base = '/tmp/registry/agents';
    expect(() => safePath(base, '../../../etc/passwd')).toThrow('Path traversal blocked');
    expect(() => safePath(base, '../../.claude/agents/evil')).toThrow('Path traversal blocked');
  });
});

describe('validateFiniteNumber', () => {
  it('accepts valid numbers', () => {
    expect(validateFiniteNumber(0.5, 'test')).toBe(0.5);
    expect(validateFiniteNumber('0.8', 'test')).toBe(0.8);
  });

  it('rejects NaN and Infinity', () => {
    expect(() => validateFiniteNumber('abc', 'test')).toThrow('finite number');
    expect(() => validateFiniteNumber(NaN, 'test')).toThrow('finite number');
    expect(() => validateFiniteNumber(Infinity, 'test')).toThrow('finite number');
  });
});

describe('validateScore', () => {
  it('accepts valid scores', () => {
    expect(validateScore(0)).toBe(0);
    expect(validateScore(1)).toBe(1);
    expect(validateScore(0.5)).toBe(0.5);
  });

  it('rejects out of range', () => {
    expect(() => validateScore(-0.1)).toThrow('between 0.0 and 1.0');
    expect(() => validateScore(1.1)).toThrow('between 0.0 and 1.0');
  });

  it('rejects NaN bypassing range check', () => {
    expect(() => validateScore('notanumber')).toThrow('finite number');
  });
});
