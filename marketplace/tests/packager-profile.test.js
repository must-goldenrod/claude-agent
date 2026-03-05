import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, closeDb } from '../src/db.js';
import { recordExecution } from '../src/tracker.js';
import { attachPerformance, buildMeta } from '../src/packager.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(import.meta.dirname, 'test-packager-profile.db');

describe('Packager with Profile', () => {
  beforeEach(() => { createDb(TEST_DB); });
  afterEach(() => { closeDb(); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); });

  it('attachPerformance adds profile data to meta', () => {
    for (let i = 0; i < 3; i++) {
      recordExecution({
        agentId: 'test-agent',
        model: 'sonnet',
        sessionId: `s-${i}`,
        promptPreview: `task ${i}`,
        output: JSON.stringify({
          agent: 'test-agent', team: 'security', phase: 'implementation',
          timestamp: new Date().toISOString(),
          findings: [{ title: 'f', detail: 'd' }],
          recommendations: [{ priority: 'high', action: 'fix' }],
          confidence_score: 0.8, concerns: [], sources: [],
        }),
        durationMs: 2000,
        outputLength: 300,
        tokenEstimate: 75,
        projectType: 'typescript',
        modelVersion: 'claude-sonnet-4-6',
      });
    }

    const meta = buildMeta({ name: 'test-agent', model: 'sonnet' });
    attachPerformance(meta, 'test-agent');

    expect(meta.performance).toBeDefined();
    expect(meta.performance.quality).toBeGreaterThanOrEqual(0);
    expect(meta.performance.composite).toBeGreaterThanOrEqual(0);
    expect(meta.performance.sample_size).toBe(3);
    expect(meta.performance.context).toBeDefined();
    expect(meta.avg_score).toBe(meta.performance.composite);
    expect(meta.total_executions).toBe(3);
  });

  it('attachPerformance does nothing when no data', () => {
    const meta = buildMeta({ name: 'no-data-agent', model: 'sonnet' });
    attachPerformance(meta, 'no-data-agent');
    expect(meta.performance).toBeUndefined();
    expect(meta.avg_score).toBeNull();
  });
});
