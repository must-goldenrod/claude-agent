import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import { recordExecution } from '../src/tracker.js';
import {
  recordLlmEvaluation,
  recordUserFeedback,
  getCompositeScore,
  getEvaluationsForExecution,
  buildEvalPrompt,
  parseLlmScores,
} from '../src/evaluator.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(import.meta.dirname, 'test-evaluator.db');

const VALID_OUTPUT = JSON.stringify({
  agent: 'security-auditor', team: 'security', phase: 'implementation',
  timestamp: '2026-03-04T10:00:00Z', input_summary: 'Reviewed auth module',
  findings: [{ title: 'SQL Injection', detail: 'Found in login handler', evidence: 'auth.js:42' }],
  recommendations: [{ action: 'Use parameterized queries', priority: 'high', rationale: 'CWE-89' }],
  confidence_score: 0.9, concerns: [], sources: ['https://owasp.org'],
});

describe('Evaluator', () => {
  let execId;

  beforeEach(() => {
    createDb(TEST_DB);
    execId = recordExecution({
      agentId: 'security-auditor', model: 'sonnet',
      promptPreview: 'Audit auth code', output: VALID_OUTPUT, durationMs: 10000,
    });
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('buildEvalPrompt creates a proper evaluation prompt', () => {
    const prompt = buildEvalPrompt('Audit auth code', VALID_OUTPUT);
    expect(prompt).toContain('relevance');
    expect(prompt).toContain('depth');
    expect(prompt).toContain('actionability');
    expect(prompt).toContain('Audit auth code');
  });

  it('parseLlmScores extracts valid JSON from response', () => {
    const response = 'Here is my evaluation:\n{"relevance": 0.9, "depth": 0.8, "actionability": 0.85, "consistency": 0.9}';
    const scores = parseLlmScores(response);
    expect(scores.relevance).toBe(0.9);
    expect(scores.depth).toBe(0.8);
  });

  it('parseLlmScores throws on invalid response', () => {
    expect(() => parseLlmScores('no json here')).toThrow('No JSON found');
  });

  it('parseLlmScores throws on out-of-range scores', () => {
    expect(() => parseLlmScores('{"relevance": 1.5, "depth": 0.8, "actionability": 0.85, "consistency": 0.9}')).toThrow('Invalid score');
  });

  it('recordLlmEvaluation stores scores in evaluations table', () => {
    const scores = { relevance: 0.9, depth: 0.8, actionability: 0.85, consistency: 0.9 };
    recordLlmEvaluation(execId, scores, 'claude-haiku-4-5-20251001');

    const evals = getDb().prepare(
      "SELECT * FROM evaluations WHERE execution_id = ? AND eval_type = 'llm'"
    ).all(execId);
    expect(evals).toHaveLength(1);
    const avg = (0.9 + 0.8 + 0.85 + 0.9) / 4;
    expect(evals[0].score).toBeCloseTo(avg, 2);
    expect(evals[0].evaluator).toBe('claude-haiku-4-5-20251001');
  });

  it('recordUserFeedback stores user score and comment', () => {
    recordUserFeedback(execId, 0.8, 'Good analysis but missed XSS');

    const evals = getDb().prepare(
      "SELECT * FROM evaluations WHERE execution_id = ? AND eval_type = 'user'"
    ).all(execId);
    expect(evals).toHaveLength(1);
    expect(evals[0].score).toBe(0.8);
    const details = JSON.parse(evals[0].details);
    expect(details.comment).toBe('Good analysis but missed XSS');
  });

  it('getCompositeScore computes weighted average (schema + llm)', () => {
    recordLlmEvaluation(execId, { relevance: 0.8, depth: 0.7, actionability: 0.9, consistency: 0.8 }, 'haiku');
    const composite = getCompositeScore(execId);
    const llmAvg = (0.8 + 0.7 + 0.9 + 0.8) / 4;
    const expected = 1.0 * 0.3 + llmAvg * 0.7;
    expect(composite.score).toBeCloseTo(expected, 2);
    expect(composite.hasUserFeedback).toBe(false);
  });

  it('getCompositeScore includes user feedback with adjusted weights', () => {
    recordLlmEvaluation(execId, { relevance: 0.8, depth: 0.7, actionability: 0.9, consistency: 0.8 }, 'haiku');
    recordUserFeedback(execId, 0.75, 'Decent');
    const composite = getCompositeScore(execId);
    const llmAvg = (0.8 + 0.7 + 0.9 + 0.8) / 4;
    const expected = 1.0 * 0.2 + llmAvg * 0.4 + 0.75 * 0.4;
    expect(composite.score).toBeCloseTo(expected, 2);
    expect(composite.hasUserFeedback).toBe(true);
  });

  it('getCompositeScore returns schema-only when no llm/user', () => {
    const composite = getCompositeScore(execId);
    expect(composite.score).toBe(1.0);
    expect(composite.breakdown.schema).toBe(1.0);
  });

  it('getEvaluationsForExecution returns all evals', () => {
    recordLlmEvaluation(execId, { relevance: 0.8, depth: 0.7, actionability: 0.9, consistency: 0.8 }, 'haiku');
    recordUserFeedback(execId, 0.75, 'OK');
    const evals = getEvaluationsForExecution(execId);
    expect(evals).toHaveLength(3); // schema + llm + user
  });
});
