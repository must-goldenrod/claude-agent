import { describe, it, expect } from 'vitest';
import { validateAgentOutput } from '../src/validator.js';

const VALID_OUTPUT = {
  agent: 'security-auditor',
  team: 'security',
  phase: 'implementation',
  timestamp: '2026-03-04T10:00:00Z',
  input_summary: 'Review auth code',
  findings: [{ title: 'SQL Injection', detail: 'Found in login', evidence: 'line 42' }],
  recommendations: [{ action: 'Parameterize queries', priority: 'high', rationale: 'CWE-89' }],
  confidence_score: 0.85,
  concerns: [],
  sources: ['https://owasp.org']
};

describe('validateAgentOutput', () => {
  it('returns 1.0 for fully valid output', () => {
    const result = validateAgentOutput(JSON.stringify(VALID_OUTPUT));
    expect(result.score).toBe(1.0);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns 0.0 for invalid JSON', () => {
    const result = validateAgentOutput('not json');
    expect(result.score).toBe(0.0);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('JSON');
  });

  it('deducts for missing required fields', () => {
    const partial = { agent: 'test', team: 'research' };
    const result = validateAgentOutput(JSON.stringify(partial));
    expect(result.score).toBeLessThan(1.0);
    expect(result.score).toBeGreaterThan(0.0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('deducts for invalid confidence_score range', () => {
    const bad = { ...VALID_OUTPUT, confidence_score: 1.5 };
    const result = validateAgentOutput(JSON.stringify(bad));
    expect(result.score).toBeLessThan(1.0);
  });

  it('deducts for invalid priority enum', () => {
    const bad = {
      ...VALID_OUTPUT,
      recommendations: [{ action: 'Do it', priority: 'ASAP', rationale: 'why' }]
    };
    const result = validateAgentOutput(JSON.stringify(bad));
    expect(result.score).toBeLessThan(1.0);
  });

  it('validates debate team extensions', () => {
    const debate = {
      ...VALID_OUTPUT,
      team: 'debate',
      round: 1,
      position: 'opening',
      arguments: [{ claim: 'x', evidence: 'y', strength: 'strong' }],
      counterarguments: []
    };
    const result = validateAgentOutput(JSON.stringify(debate));
    expect(result.score).toBe(1.0);
  });

  it('handles empty string output', () => {
    const result = validateAgentOutput('');
    expect(result.score).toBe(0.0);
    expect(result.valid).toBe(false);
  });
});
