import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import { recordExecution } from '../src/tracker.js';
import { formatProfile, formatTeamProfiles } from '../src/cli-profile.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(import.meta.dirname, 'test-cli-profile.db');

function seedAgent(agentId, count = 5) {
  for (let i = 0; i < count; i++) {
    recordExecution({
      agentId,
      model: 'sonnet',
      sessionId: `sess-${i}`,
      pipelinePhase: 'implementation',
      promptPreview: `task ${i}`,
      output: JSON.stringify({
        agent: agentId, team: 'security', phase: 'implementation',
        timestamp: new Date().toISOString(),
        findings: [{ title: 'f', detail: 'd' }],
        recommendations: [{ priority: 'high', action: 'fix' }],
        confidence_score: 0.8, concerns: [], sources: [],
      }),
      durationMs: 2000 + i * 100,
      outputLength: 300,
      tokenEstimate: 75,
      callOrder: i + 1,
      projectType: 'typescript',
      modelVersion: 'claude-sonnet-4-6',
    });
  }
}

describe('CLI Profile', () => {
  beforeEach(() => { createDb(TEST_DB); });
  afterEach(() => { closeDb(); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); });

  it('formatProfile outputs 4-axis display', () => {
    seedAgent('sec-audit', 10);
    const output = formatProfile('sec-audit');
    expect(output).toContain('sec-audit');
    expect(output).toContain('Quality');
    expect(output).toContain('Efficiency');
    expect(output).toContain('Reliability');
    expect(output).toContain('Impact');
    expect(output).toContain('Composite');
  });

  it('formatProfile returns message for unknown agent', () => {
    const output = formatProfile('nonexistent');
    expect(output).toContain('No execution data');
  });

  it('formatProfile supports JSON output', () => {
    seedAgent('json-agent', 3);
    const output = formatProfile('json-agent', { json: true });
    const parsed = JSON.parse(output);
    expect(parsed.quality).toBeDefined();
    expect(parsed.composite).toBeDefined();
  });

  it('formatTeamProfiles lists agents ranked by composite', () => {
    seedAgent('agent-a', 3);
    seedAgent('agent-b', 3);
    const output = formatTeamProfiles();
    expect(output).toContain('agent-a');
    expect(output).toContain('agent-b');
    expect(output).toContain('Quality');
  });
});
