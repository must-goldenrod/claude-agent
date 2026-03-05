import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import { recordExecution } from '../src/tracker.js';
import { recordLlmEvaluation, recordUserFeedback, getCompositeScore } from '../src/evaluator.js';
import { calculateProfile, refreshProfile, getProfile, getProfileHistory } from '../src/profiler.js';
import { formatProfile } from '../src/cli-profile.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(import.meta.dirname, 'test-profile-integration.db');

describe('Profile Integration', () => {
  beforeEach(() => { createDb(TEST_DB); });
  afterEach(() => { closeDb(); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); });

  it('full pipeline: record -> evaluate -> profile -> display', () => {
    // 1. Record 5 executions
    const execIds = [];
    for (let i = 0; i < 5; i++) {
      const id = recordExecution({
        agentId: 'pipeline-agent',
        model: 'sonnet',
        sessionId: `sess-${i}`,
        pipelinePhase: 'implementation',
        promptPreview: `Review module ${i}`,
        output: JSON.stringify({
          agent: 'pipeline-agent', team: 'code', phase: 'implementation',
          timestamp: new Date().toISOString(),
          findings: [{ title: `finding-${i}`, detail: 'details' }],
          recommendations: [{ priority: 'high', action: 'fix it' }],
          confidence_score: 0.85, concerns: [], sources: [],
        }),
        durationMs: 3000 + i * 200,
        outputLength: 400,
        tokenEstimate: 100,
        callOrder: i + 1,
        projectType: 'typescript',
        modelVersion: 'claude-sonnet-4-6',
      });
      execIds.push(id);
    }

    // 2. Add LLM evaluations
    for (const id of execIds) {
      recordLlmEvaluation(id, {
        relevance: 0.88, depth: 0.82, actionability: 0.9, consistency: 0.85,
      }, 'haiku');
    }

    // 3. Add user feedback
    recordUserFeedback(execIds[0], 0.9, 'Excellent analysis');
    recordUserFeedback(execIds[1], 0.75, 'Good but missed edge case');

    // 4. Calculate profile
    const profile = calculateProfile('pipeline-agent');
    expect(profile.sampleSize).toBe(5);
    expect(profile.quality).toBeGreaterThan(0.5);
    expect(profile.efficiency).toBeGreaterThanOrEqual(0);
    expect(profile.reliability).toBeGreaterThan(0.5);
    expect(profile.composite).toBeGreaterThan(0);

    // Verify project type data is accessible via the DB (not on profile object directly)
    const db = getDb();
    const projectTypes = db.prepare(
      'SELECT DISTINCT project_type FROM executions WHERE agent_id = ?'
    ).all('pipeline-agent').map(r => r.project_type).filter(Boolean);
    expect(projectTypes).toContain('typescript');

    // 5. Refresh and verify persistence
    refreshProfile('pipeline-agent');
    const saved = getProfile('pipeline-agent');
    expect(saved.composite_score).toBeCloseTo(profile.composite, 1);

    // 6. Verify history
    const history = getProfileHistory('pipeline-agent');
    expect(history.length).toBe(1);

    // 7. CLI output works
    const display = formatProfile('pipeline-agent');
    expect(display).toContain('pipeline-agent');
    expect(display).toContain('Quality');

    // 8. Old composite score still works (backward compat)
    const oldComposite = getCompositeScore(execIds[0]);
    expect(oldComposite.score).toBeGreaterThan(0);
  });
});
