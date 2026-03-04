import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import { recordExecution, getAgentStats } from '../src/tracker.js';
import { shouldTrack, parseHookInput } from '../src/hook-parser.js';
import { formatStats } from '../src/cli.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(import.meta.dirname, 'test-integration.db');

describe('Integration: Hook -> Tracker -> CLI', () => {
  beforeEach(() => {
    createDb(TEST_DB);
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('full pipeline: hook input -> record -> stats -> display', () => {
    const hookInput = {
      tool_name: 'Agent',
      tool_input: {
        prompt: 'Review the authentication module for security vulnerabilities',
        subagent_type: 'security-auditor',
        model: 'sonnet',
      },
      tool_output: JSON.stringify({
        agent: 'security-auditor',
        team: 'security',
        phase: 'implementation',
        timestamp: '2026-03-04T10:00:00Z',
        input_summary: 'Reviewed auth module',
        findings: [
          { title: 'Weak password hashing', detail: 'Using MD5', evidence: 'auth.js:42' }
        ],
        recommendations: [
          { action: 'Switch to bcrypt', priority: 'high', rationale: 'CWE-328' }
        ],
        confidence_score: 0.9,
        concerns: [],
        sources: ['https://owasp.org']
      }),
    };

    // Step 1: Hook parses input
    expect(shouldTrack(hookInput)).toBe(true);
    const parsed = parseHookInput(hookInput);
    expect(parsed.agentId).toBe('security-auditor');

    // Step 2: Tracker records execution
    const execId = recordExecution({
      agentId: parsed.agentId,
      model: parsed.model,
      promptPreview: parsed.promptPreview,
      output: parsed.output,
      durationMs: 15000,
    });
    expect(execId).toBeGreaterThan(0);

    // Step 3: Verify schema evaluation was recorded
    const evals = getDb().prepare(
      'SELECT * FROM evaluations WHERE execution_id = ?'
    ).all(execId);
    expect(evals).toHaveLength(1);
    expect(evals[0].eval_type).toBe('schema');
    expect(evals[0].score).toBe(1.0);

    // Step 4: Stats are available
    const stats = getAgentStats('security-auditor');
    expect(stats.totalExecutions).toBe(1);
    expect(stats.avgSchemaScore).toBe(1.0);

    // Step 5: CLI can display
    const display = formatStats('security-auditor');
    expect(display).toContain('security-auditor');
    expect(display).toContain('1');
  });

  it('tracks multiple agents across sessions', () => {
    const agents = ['security-auditor', 'code-reviewer-impl', 'research-lead'];

    for (const agentId of agents) {
      for (let i = 0; i < 3; i++) {
        recordExecution({
          agentId,
          sessionId: `session-${i}`,
          output: JSON.stringify({
            agent: agentId, team: 'research', phase: 'testing',
            timestamp: new Date().toISOString(),
            findings: [], recommendations: [], confidence_score: 0.8,
            concerns: [], sources: []
          }),
          durationMs: 5000 + Math.random() * 5000,
        });
      }
    }

    for (const agentId of agents) {
      const stats = getAgentStats(agentId);
      expect(stats.totalExecutions).toBe(3);
    }

    const total = getDb().prepare('SELECT COUNT(*) as n FROM executions').get();
    expect(total.n).toBe(9);
  });
});
