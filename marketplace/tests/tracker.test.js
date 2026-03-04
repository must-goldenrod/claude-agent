import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import { recordExecution, getExecutions, getAgentStats } from '../src/tracker.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(import.meta.dirname, 'test-tracker.db');

describe('Tracker', () => {
  beforeEach(() => {
    createDb(TEST_DB);
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('records an execution and auto-registers agent', () => {
    const id = recordExecution({
      agentId: 'security-auditor',
      model: 'sonnet',
      sessionId: 'sess-1',
      pipelinePhase: 'implementation',
      promptPreview: 'Audit the auth code',
      output: JSON.stringify({
        agent: 'security-auditor',
        team: 'security',
        phase: 'implementation',
        timestamp: new Date().toISOString(),
        findings: [],
        recommendations: [],
        confidence_score: 0.8,
        concerns: [],
        sources: []
      }),
      durationMs: 5000,
    });

    expect(id).toBeGreaterThan(0);

    const agent = getDb().prepare('SELECT * FROM agents WHERE id = ?').get('security-auditor');
    expect(agent).toBeDefined();
    expect(agent.model).toBe('sonnet');
  });

  it('getExecutions returns recent executions', () => {
    recordExecution({ agentId: 'test-agent', output: '{}', durationMs: 1000 });
    recordExecution({ agentId: 'test-agent', output: '{}', durationMs: 2000 });

    const execs = getExecutions('test-agent');
    expect(execs).toHaveLength(2);
  });

  it('getAgentStats returns aggregated stats', () => {
    for (let i = 0; i < 3; i++) {
      recordExecution({
        agentId: 'stat-agent',
        output: JSON.stringify({
          agent: 'stat-agent', team: 'research', phase: 'testing',
          timestamp: new Date().toISOString(),
          findings: [], recommendations: [], confidence_score: 0.9,
          concerns: [], sources: []
        }),
        durationMs: 1000 + i * 500,
      });
    }

    const stats = getAgentStats('stat-agent');
    expect(stats.totalExecutions).toBe(3);
    expect(stats.avgDurationMs).toBeGreaterThan(0);
    expect(stats.avgSchemaScore).toBeGreaterThan(0);
  });
});
