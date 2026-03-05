import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import { recordExecution } from '../src/tracker.js';
import { recordLlmEvaluation, recordUserFeedback } from '../src/evaluator.js';
import { calculateProfile, refreshProfile, getProfile } from '../src/profiler.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(import.meta.dirname, 'test-profiler.db');

function seedAgent(agentId, count = 5, opts = {}) {
  for (let i = 0; i < count; i++) {
    recordExecution({
      agentId,
      model: opts.model || 'sonnet',
      sessionId: opts.sessionId || `sess-${i}`,
      pipelinePhase: opts.phase || 'implementation',
      promptPreview: `task ${i}`,
      output: JSON.stringify({
        agent: agentId, team: opts.team || 'security',
        phase: 'implementation', timestamp: new Date().toISOString(),
        findings: [{ title: 'f1', detail: 'd1' }],
        recommendations: [{ priority: 'high', action: 'fix' }],
        confidence_score: 0.8, concerns: [], sources: [],
      }),
      durationMs: 1000 + i * 500,
      outputLength: 200 + i * 50,
      tokenEstimate: 50 + i * 12,
      callOrder: i + 1,
      projectType: 'typescript',
      modelVersion: 'claude-sonnet-4-6',
    });
  }
}

describe('Profiler', () => {
  beforeEach(() => { createDb(TEST_DB); });
  afterEach(() => { closeDb(); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); });

  it('calculateProfile returns 4-axis scores', () => {
    seedAgent('sec-audit', 10);
    const profile = calculateProfile('sec-audit');
    expect(profile.quality).toBeGreaterThanOrEqual(0);
    expect(profile.quality).toBeLessThanOrEqual(1);
    expect(profile.efficiency).toBeGreaterThanOrEqual(0);
    expect(profile.reliability).toBeGreaterThanOrEqual(0);
    expect(profile.impact).toBeGreaterThanOrEqual(0);
    expect(profile.composite).toBeGreaterThanOrEqual(0);
    expect(profile.sampleSize).toBe(10);
  });

  it('quality score improves with LLM evaluations', () => {
    seedAgent('q-agent', 3);
    const db = getDb();
    const execs = db.prepare('SELECT id FROM executions WHERE agent_id = ?').all('q-agent');
    for (const e of execs) {
      recordLlmEvaluation(e.id, { relevance: 0.9, depth: 0.85, actionability: 0.88, consistency: 0.87 }, 'haiku');
    }
    const profile = calculateProfile('q-agent');
    expect(profile.quality).toBeGreaterThan(0.5);
    expect(profile.qualityDetails.relevance).toBeCloseTo(0.9, 1);
  });

  it('reliability reflects schema compliance rate', () => {
    seedAgent('rel-agent', 5);
    const profile = calculateProfile('rel-agent');
    expect(profile.reliability).toBeGreaterThan(0.8);
    expect(profile.reliabilityDetails.schemaCompliance).toBeGreaterThan(0.8);
  });

  it('refreshProfile saves to agent_profiles table', () => {
    seedAgent('refresh-agent', 5);
    refreshProfile('refresh-agent');
    const saved = getProfile('refresh-agent');
    expect(saved).not.toBeNull();
    expect(saved.composite_score).toBeGreaterThan(0);
  });

  it('refreshProfile records history snapshot', () => {
    seedAgent('hist-agent', 5);
    refreshProfile('hist-agent');
    const db = getDb();
    const history = db.prepare('SELECT * FROM profile_history WHERE agent_id = ?').all('hist-agent');
    expect(history.length).toBe(1);
  });

  it('returns zero profile for unknown agent', () => {
    const profile = calculateProfile('nonexistent');
    expect(profile.sampleSize).toBe(0);
    expect(profile.composite).toBe(0);
  });
});
