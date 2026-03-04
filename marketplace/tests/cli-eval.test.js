import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import { recordExecution } from '../src/tracker.js';
import { recordLlmEvaluation, recordUserFeedback } from '../src/evaluator.js';
import { formatCompositeScore, formatEvalReport } from '../src/cli.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(import.meta.dirname, 'test-cli-eval.db');

const VALID_OUTPUT = JSON.stringify({
  agent: 'test-agent', team: 'security', phase: 'implementation',
  timestamp: '2026-03-04T10:00:00Z', input_summary: 'test',
  findings: [{ title: 'Bug', detail: 'Found it', evidence: 'line 1' }],
  recommendations: [{ action: 'Fix it', priority: 'high', rationale: 'Because' }],
  confidence_score: 0.9, concerns: [], sources: [],
});

describe('CLI Eval Formatters', () => {
  let execId;

  beforeEach(() => {
    createDb(TEST_DB);
    execId = recordExecution({
      agentId: 'test-agent', output: VALID_OUTPUT, durationMs: 5000,
    });
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('formatCompositeScore shows schema-only score', () => {
    const output = formatCompositeScore(execId);
    expect(output).toContain('Schema');
    expect(output).toContain('1.0');
  });

  it('formatCompositeScore shows all three scores', () => {
    recordLlmEvaluation(execId, { relevance: 0.8, depth: 0.7, actionability: 0.9, consistency: 0.8 }, 'haiku');
    recordUserFeedback(execId, 0.75, 'OK');
    const output = formatCompositeScore(execId);
    expect(output).toContain('Schema');
    expect(output).toContain('LLM');
    expect(output).toContain('User');
    expect(output).toContain('Composite');
  });

  it('formatEvalReport shows agent summary', () => {
    recordLlmEvaluation(execId, { relevance: 0.8, depth: 0.7, actionability: 0.9, consistency: 0.8 }, 'haiku');
    const output = formatEvalReport('test-agent');
    expect(output).toContain('test-agent');
    expect(output).toContain('Avg Composite');
  });
});
