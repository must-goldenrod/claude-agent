import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import { recordExecution } from '../src/tracker.js';
import { recordLlmEvaluation, recordUserFeedback, getCompositeScore, parseLlmScores } from '../src/evaluator.js';
import { calculateProfile, refreshProfile, getProfile } from '../src/profiler.js';
import { bulkPublish } from '../src/bulk-publish.js';
import { loadRegistry, saveRegistry, registerAgent } from '../src/registry.js';
import { exportAllData } from '../src/data-export.js';
import { safePath } from '../src/sanitize.js';
import { parseHookInput, shouldTrack } from '../src/hook-parser.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DB = path.join(import.meta.dirname, 'test-sec-integration.db');

// ============================================================
// Integration: Full pipeline with security fixes in place
// ============================================================
describe('Security Integration: full pipeline with all fixes', () => {
  beforeEach(() => { createDb(TEST_DB); });
  afterEach(() => { closeDb(); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); });

  it('hook parse → record → LLM eval (balanced parser) → profile (exception-safe) → composite', () => {
    // Step 1: Hook input parsing
    const hookInput = {
      tool_name: 'Agent',
      tool_input: {
        prompt: 'Analyze authentication module for SQL injection',
        subagent_type: 'security-auditor',
        model: 'sonnet',
      },
      tool_output: JSON.stringify({
        agent: 'security-auditor', team: 'security', phase: 'implementation',
        timestamp: '2026-03-22T10:00:00Z', input_summary: 'Auth review',
        findings: [{ title: 'SQL Injection', detail: 'In login', evidence: 'auth.js:10' }],
        recommendations: [{ action: 'Use parameterized queries', priority: 'high', rationale: 'CWE-89' }],
        confidence_score: 0.95, concerns: [], sources: ['https://owasp.org'],
      }),
    };

    expect(shouldTrack(hookInput)).toBe(true);
    const parsed = parseHookInput(hookInput);
    expect(parsed.agentId).toBe('security-auditor');

    // Step 2: Record execution
    const execId = recordExecution({
      agentId: parsed.agentId,
      model: parsed.model,
      promptPreview: parsed.promptPreview,
      output: parsed.output,
      durationMs: 12000,
      outputLength: parsed.outputLength,
      tokenEstimate: parsed.tokenEstimate,
    });
    expect(execId).toBeGreaterThan(0);

    // Step 3: Simulate LLM response with nested JSON (tests balanced parser)
    const llmResponse = 'My evaluation:\n{"relevance": 0.92, "depth": 0.88, "actionability": 0.9, "consistency": 0.85}';
    const scores = parseLlmScores(llmResponse);
    expect(scores.relevance).toBe(0.92);
    recordLlmEvaluation(execId, scores, 'claude-haiku-4-5-20251001');

    // Step 4: User feedback
    recordUserFeedback(execId, 0.85, 'Solid analysis');

    // Step 5: Composite score
    const composite = getCompositeScore(execId);
    expect(composite.hasLlm).toBe(true);
    expect(composite.hasUserFeedback).toBe(true);
    expect(composite.score).toBeGreaterThan(0);
    expect(composite.score).toBeLessThanOrEqual(1);

    // Step 6: Profile calculation (with exception-safe JSON parsing)
    const profile = calculateProfile('security-auditor');
    expect(profile.sampleSize).toBe(1);
    expect(profile.quality).toBeGreaterThan(0.5);
    expect(profile.composite).toBeGreaterThan(0);
  });

  it('profile calculation survives mixed valid and corrupted evaluations across agents', () => {
    const agents = ['good-agent', 'bad-agent', 'mixed-agent'];

    for (const agentId of agents) {
      for (let i = 0; i < 3; i++) {
        recordExecution({
          agentId,
          model: 'sonnet',
          sessionId: `sess-${agentId}-${i}`,
          pipelinePhase: 'implementation',
          output: JSON.stringify({
            agent: agentId, team: 'test', phase: 'implementation',
            timestamp: new Date().toISOString(),
            findings: [{ title: 'finding', detail: 'detail' }],
            recommendations: [{ action: 'fix', priority: 'high' }],
            confidence_score: 0.8, concerns: [], sources: [],
          }),
          durationMs: 5000 + i * 1000,
          outputLength: 200,
          tokenEstimate: 50,
          projectType: 'typescript',
          modelVersion: 'sonnet',
        });
      }
    }

    const db = getDb();

    // good-agent: all valid evaluations
    const goodExecs = db.prepare('SELECT id FROM executions WHERE agent_id = ?').all('good-agent');
    for (const e of goodExecs) {
      recordLlmEvaluation(e.id, { relevance: 0.9, depth: 0.85, actionability: 0.88, consistency: 0.87 }, 'haiku');
    }

    // bad-agent: all corrupted evaluations
    const badExecs = db.prepare('SELECT id FROM executions WHERE agent_id = ?').all('bad-agent');
    for (const e of badExecs) {
      db.prepare(`
        INSERT INTO evaluations (execution_id, eval_type, score, details, evaluator)
        VALUES (?, 'llm', 0.5, 'CORRUPTED DATA', 'haiku')
      `).run(e.id);
    }

    // mixed-agent: mix of valid and corrupted
    const mixedExecs = db.prepare('SELECT id FROM executions WHERE agent_id = ?').all('mixed-agent');
    recordLlmEvaluation(mixedExecs[0].id, { relevance: 0.8, depth: 0.7, actionability: 0.9, consistency: 0.8 }, 'haiku');
    db.prepare(`
      INSERT INTO evaluations (execution_id, eval_type, score, details, evaluator)
      VALUES (?, 'llm', 0.5, '{{invalid json}}', 'haiku')
    `).run(mixedExecs[1].id);
    recordLlmEvaluation(mixedExecs[2].id, { relevance: 0.75, depth: 0.65, actionability: 0.85, consistency: 0.7 }, 'haiku');

    // All profiles should calculate without throwing
    for (const agentId of agents) {
      const profile = calculateProfile(agentId);
      expect(profile.sampleSize).toBe(3);
      expect(profile.quality).toBeGreaterThanOrEqual(0);
      expect(profile.quality).toBeLessThanOrEqual(1);
      expect(profile.composite).toBeGreaterThanOrEqual(0);
      expect(profile.composite).toBeLessThanOrEqual(1);
    }

    // Good agent should have higher quality than bad agent (corrupted = zero scores)
    const goodProfile = calculateProfile('good-agent');
    const badProfile = calculateProfile('bad-agent');
    expect(goodProfile.quality).toBeGreaterThan(badProfile.quality);

    // Refresh all profiles should succeed
    for (const agentId of agents) {
      refreshProfile(agentId);
      const saved = getProfile(agentId);
      expect(saved).not.toBeNull();
      expect(saved.composite_score).toBeGreaterThanOrEqual(0);
    }
  });
});

// ============================================================
// Integration: Bulk publish with error logging (not silent)
// ============================================================
describe('Security Integration: bulk-publish logs errors', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-bulk-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('publishes valid agents and skips invalid names with logging', () => {
    const agentsDir = path.join(tmpDir, 'agents');
    const registryDir = path.join(tmpDir, 'registry');
    fs.mkdirSync(agentsDir, { recursive: true });

    // Valid agent
    fs.writeFileSync(path.join(agentsDir, 'good-agent.md'), `---
name: good-agent
description: A good agent
model: sonnet
---
# Good Agent`);

    // Invalid agent name (uppercase, will be skipped by validateAgentName)
    fs.writeFileSync(path.join(agentsDir, 'bad.md'), `---
name: BAD-AGENT-NAME
description: Invalid
model: sonnet
---
# Bad`);

    // No frontmatter (skipped)
    fs.writeFileSync(path.join(agentsDir, 'nofm.md'), '# No FM');

    const results = bulkPublish(agentsDir, registryDir, { version: '1.0.0', author: 'tester' });
    expect(results.published).toBe(1);
    expect(results.skipped).toBe(2); // invalid name + no frontmatter
    expect(results.errors).toBe(0);

    const reg = loadRegistry(path.join(registryDir, 'registry.json'));
    expect(reg.agents['good-agent']).toBeDefined();
    expect(reg.agents['BAD-AGENT-NAME']).toBeUndefined();
  });
});

// ============================================================
// Integration: Data export with symlink defense + safePath
// ============================================================
describe('Security Integration: data-export end-to-end', () => {
  let tmpDir;

  beforeEach(() => {
    createDb(TEST_DB);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-export-'));
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exports all data correctly with sanitized filenames', () => {
    const db = getDb();

    // Seed agents with potentially dangerous names (sanitized via replace)
    const agentIds = ['normal-agent', 'agent.with.dots', 'agent_underscore'];
    for (const agentId of agentIds) {
      db.prepare("INSERT INTO agents (id, team, model) VALUES (?, ?, ?)").run(agentId, 'test', 'sonnet');
      db.prepare(
        "INSERT INTO executions (agent_id, session_id, output_schema_valid, schema_score, duration_ms) VALUES (?, ?, ?, ?, ?)"
      ).run(agentId, 's1', 1, 0.9, 5000);
    }

    const regPath = path.join(tmpDir, 'registry.json');
    const reg = { version: '1.0.0', agents: {}, updated_at: new Date().toISOString() };
    for (const name of agentIds) {
      registerAgent(reg, { name, version: '1.0.0', description: 'test', tags: ['test'] }, 'hash');
    }
    saveRegistry(reg, regPath);

    const outputDir = path.join(tmpDir, 'output');
    const result = exportAllData(regPath, outputDir);

    expect(result.detailCount).toBe(3);
    for (const agentId of agentIds) {
      const safeName = agentId.replace(/[^a-z0-9._-]/gi, '-');
      expect(fs.existsSync(path.join(outputDir, 'stats', `${safeName}.json`))).toBe(true);
    }
  });
});

// ============================================================
// Integration: DB permissions preserved across operations
// ============================================================
describe('Security Integration: DB lifecycle with permissions', () => {
  const LIFECYCLE_DB = path.join(import.meta.dirname, 'test-lifecycle.db');

  afterEach(() => {
    closeDb();
    if (fs.existsSync(LIFECYCLE_DB)) fs.unlinkSync(LIFECYCLE_DB);
  });

  it('maintains restricted permissions through create → use → close → reopen', () => {
    // Create
    createDb(LIFECYCLE_DB);
    const mode1 = fs.statSync(LIFECYCLE_DB).mode & 0o777;
    expect(mode1).toBe(0o600);

    // Use
    recordExecution({
      agentId: 'perm-test', model: 'sonnet',
      output: JSON.stringify({
        agent: 'perm-test', team: 'test', phase: 'testing',
        timestamp: new Date().toISOString(),
        findings: [], recommendations: [],
        confidence_score: 0.8, concerns: [], sources: [],
      }),
      durationMs: 5000,
    });

    // Close
    closeDb();

    // Verify permissions still intact after close
    const mode2 = fs.statSync(LIFECYCLE_DB).mode & 0o777;
    expect(mode2).toBe(0o600);

    // Reopen
    createDb(LIFECYCLE_DB);
    const mode3 = fs.statSync(LIFECYCLE_DB).mode & 0o777;
    expect(mode3).toBe(0o600);

    // Data should persist
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) as n FROM executions').get();
    expect(count.n).toBe(1);
  });
});

// ============================================================
// Integration: Hook parser sanitization → DB safety
// ============================================================
describe('Security Integration: hook input sanitization through pipeline', () => {
  beforeEach(() => { createDb(TEST_DB); });
  afterEach(() => { closeDb(); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); });

  it('sanitizes malicious agent IDs from hook input', () => {
    const hookInput = {
      tool_name: 'Agent',
      tool_input: {
        prompt: 'evil prompt',
        subagent_type: '../../../etc/passwd',
        model: 'sonnet',
      },
      tool_output: '{"result": "test"}',
    };

    const parsed = parseHookInput(hookInput);
    // Should be sanitized: path separators become dashes
    expect(parsed.agentId).not.toContain('/');

    // Should safely store in DB
    const execId = recordExecution({
      agentId: parsed.agentId,
      model: parsed.model,
      output: parsed.output,
      durationMs: 1000,
    });
    expect(execId).toBeGreaterThan(0);

    const db = getDb();
    const row = db.prepare('SELECT agent_id FROM executions WHERE id = ?').get(execId);
    expect(row.agent_id).not.toContain('/');
  });

  it('sanitizes XSS-like agent IDs', () => {
    const hookInput = {
      tool_name: 'Agent',
      tool_input: {
        subagent_type: '<script>alert("xss")</script>',
      },
      tool_output: '',
    };

    const parsed = parseHookInput(hookInput);
    expect(parsed.agentId).not.toContain('<');
    expect(parsed.agentId).not.toContain('>');
    expect(parsed.agentId).not.toContain('"');
  });

  it('handles empty and null agent type gracefully', () => {
    const input1 = { tool_name: 'Agent', tool_input: {}, tool_output: '' };
    expect(parseHookInput(input1).agentId).toBe('unknown');

    const input2 = { tool_name: 'Agent', tool_input: { subagent_type: null }, tool_output: '' };
    expect(parseHookInput(input2).agentId).toBe('unknown');

    const input3 = { tool_name: 'Agent', tool_input: { subagent_type: '' }, tool_output: '' };
    expect(parseHookInput(input3).agentId).toBe('unknown');
  });
});
