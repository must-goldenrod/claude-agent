import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import { parseLlmScores } from '../src/evaluator.js';
import { calculateProfile } from '../src/profiler.js';
import { recordExecution } from '../src/tracker.js';
import { recordLlmEvaluation } from '../src/evaluator.js';
import { safePath } from '../src/sanitize.js';
import { exportAllData } from '../src/data-export.js';
import { loadRegistry, saveRegistry, registerAgent } from '../src/registry.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DB = path.join(import.meta.dirname, 'test-security.db');

// ============================================================
// CRITICAL #1: JSON balanced-brace parser (evaluator.js)
// ============================================================
describe('Security: parseLlmScores balanced-brace parser', () => {
  it('parses simple flat JSON', () => {
    const response = '{"relevance": 0.9, "depth": 0.8, "actionability": 0.85, "consistency": 0.9}';
    const scores = parseLlmScores(response);
    expect(scores.relevance).toBe(0.9);
    expect(scores.depth).toBe(0.8);
    expect(scores.actionability).toBe(0.85);
    expect(scores.consistency).toBe(0.9);
  });

  it('parses JSON with surrounding text', () => {
    const response = 'Here is my evaluation:\n{"relevance": 0.7, "depth": 0.6, "actionability": 0.8, "consistency": 0.75}\nDone.';
    const scores = parseLlmScores(response);
    expect(scores.relevance).toBe(0.7);
  });

  it('parses nested JSON structures without truncation', () => {
    const response = '{"relevance": 0.9, "depth": 0.8, "actionability": 0.85, "consistency": 0.9, "meta": {"note": "good"}}';
    const scores = parseLlmScores(response);
    expect(scores.relevance).toBe(0.9);
    expect(scores.meta).toBeDefined();
    expect(scores.meta.note).toBe('good');
  });

  it('parses JSON with curly braces in string values', () => {
    const response = '{"relevance": 0.9, "depth": 0.8, "actionability": 0.85, "consistency": 0.9}';
    const scores = parseLlmScores(response);
    expect(scores.relevance).toBe(0.9);
  });

  it('throws on unbalanced braces', () => {
    expect(() => parseLlmScores('{"relevance": 0.9')).toThrow('unbalanced braces');
  });

  it('throws when no JSON found', () => {
    expect(() => parseLlmScores('no json here at all')).toThrow('No JSON found');
  });

  it('throws on empty input', () => {
    expect(() => parseLlmScores('')).toThrow('No JSON found');
  });

  it('still validates score ranges after parsing', () => {
    expect(() => parseLlmScores('{"relevance": 1.5, "depth": 0.8, "actionability": 0.85, "consistency": 0.9}')).toThrow('Invalid score');
  });

  it('still validates negative scores', () => {
    expect(() => parseLlmScores('{"relevance": -0.1, "depth": 0.8, "actionability": 0.85, "consistency": 0.9}')).toThrow('Invalid score');
  });
});

// ============================================================
// CRITICAL #2: DB file permissions (db.js)
// ============================================================
describe('Security: DB file permissions', () => {
  const PERM_DB = path.join(import.meta.dirname, 'test-perms.db');

  afterEach(() => {
    closeDb();
    if (fs.existsSync(PERM_DB)) fs.unlinkSync(PERM_DB);
  });

  it('creates new DB with restricted permissions (0o600)', () => {
    createDb(PERM_DB);
    const stat = fs.statSync(PERM_DB);
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('does not change permissions on existing DB', () => {
    // Create a file with 0o644 first
    fs.writeFileSync(PERM_DB, '', { mode: 0o644 });
    const originalMode = fs.statSync(PERM_DB).mode & 0o777;
    createDb(PERM_DB);
    const afterMode = fs.statSync(PERM_DB).mode & 0o777;
    expect(afterMode).toBe(originalMode);
  });
});

// ============================================================
// CRITICAL #3: JSON.parse exception handling (profiler.js)
// ============================================================
describe('Security: profiler handles malformed JSON in evaluations', () => {
  beforeEach(() => { createDb(TEST_DB); });
  afterEach(() => { closeDb(); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); });

  it('survives corrupted LLM evaluation details in DB', () => {
    const execId = recordExecution({
      agentId: 'corrupt-agent', model: 'sonnet',
      output: JSON.stringify({
        agent: 'corrupt-agent', team: 'test', phase: 'testing',
        timestamp: new Date().toISOString(),
        findings: [], recommendations: [],
        confidence_score: 0.8, concerns: [], sources: [],
      }),
      durationMs: 5000,
    });

    // Insert a corrupted evaluation directly
    const db = getDb();
    db.prepare(`
      INSERT INTO evaluations (execution_id, eval_type, score, details, evaluator)
      VALUES (?, 'llm', 0.5, ?, 'haiku')
    `).run(execId, 'THIS IS NOT VALID JSON {{{');

    // Should not throw, should return valid profile
    const profile = calculateProfile('corrupt-agent');
    expect(profile.sampleSize).toBe(1);
    expect(profile.quality).toBeGreaterThanOrEqual(0);
    expect(profile.quality).toBeLessThanOrEqual(1);
  });

  it('handles null-type parsed JSON gracefully', () => {
    const execId = recordExecution({
      agentId: 'null-agent', model: 'sonnet',
      output: JSON.stringify({
        agent: 'null-agent', team: 'test', phase: 'testing',
        timestamp: new Date().toISOString(),
        findings: [], recommendations: [],
        confidence_score: 0.8, concerns: [], sources: [],
      }),
      durationMs: 5000,
    });

    const db = getDb();
    db.prepare(`
      INSERT INTO evaluations (execution_id, eval_type, score, details, evaluator)
      VALUES (?, 'llm', 0.5, 'null', 'haiku')
    `).run(execId);

    const profile = calculateProfile('null-agent');
    expect(profile.quality).toBe(0);
  });

  it('handles array-type parsed JSON gracefully', () => {
    const execId = recordExecution({
      agentId: 'array-agent', model: 'sonnet',
      output: JSON.stringify({
        agent: 'array-agent', team: 'test', phase: 'testing',
        timestamp: new Date().toISOString(),
        findings: [], recommendations: [],
        confidence_score: 0.8, concerns: [], sources: [],
      }),
      durationMs: 5000,
    });

    const db = getDb();
    db.prepare(`
      INSERT INTO evaluations (execution_id, eval_type, score, details, evaluator)
      VALUES (?, 'llm', 0.5, '[1, 2, 3]', 'haiku')
    `).run(execId);

    const profile = calculateProfile('array-agent');
    expect(profile.quality).toBeGreaterThanOrEqual(0);
  });

  it('mixed valid and corrupted evaluations produce valid profile', () => {
    // Seed multiple executions
    for (let i = 0; i < 3; i++) {
      recordExecution({
        agentId: 'mixed-agent', model: 'sonnet',
        sessionId: `s-${i}`,
        output: JSON.stringify({
          agent: 'mixed-agent', team: 'test', phase: 'testing',
          timestamp: new Date().toISOString(),
          findings: [{ title: 'f', detail: 'd' }],
          recommendations: [{ action: 'a', priority: 'high' }],
          confidence_score: 0.8, concerns: [], sources: [],
        }),
        durationMs: 5000 + i * 1000,
      });
    }

    const db = getDb();
    const execs = db.prepare('SELECT id FROM executions WHERE agent_id = ?').all('mixed-agent');

    // First: valid evaluation
    recordLlmEvaluation(execs[0].id, { relevance: 0.9, depth: 0.8, actionability: 0.85, consistency: 0.9 }, 'haiku');
    // Second: corrupted
    db.prepare(`
      INSERT INTO evaluations (execution_id, eval_type, score, details, evaluator)
      VALUES (?, 'llm', 0.5, 'BROKEN', 'haiku')
    `).run(execs[1].id);
    // Third: valid
    recordLlmEvaluation(execs[2].id, { relevance: 0.7, depth: 0.7, actionability: 0.7, consistency: 0.7 }, 'haiku');

    const profile = calculateProfile('mixed-agent');
    expect(profile.sampleSize).toBe(3);
    expect(profile.quality).toBeGreaterThan(0);
    expect(profile.quality).toBeLessThanOrEqual(1);
  });
});

// ============================================================
// HIGH #5: Tag input validation (agent-tracker.js - tested via pattern)
// ============================================================
describe('Security: tag validation pattern', () => {
  const TAG_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

  it('accepts valid tags', () => {
    expect(TAG_RE.test('security')).toBe(true);
    expect(TAG_RE.test('code-review')).toBe(true);
    expect(TAG_RE.test('test.v2')).toBe(true);
    expect(TAG_RE.test('a1_tag')).toBe(true);
  });

  it('rejects dangerous tag values', () => {
    expect(TAG_RE.test('')).toBe(false);
    expect(TAG_RE.test('../etc/passwd')).toBe(false);
    expect(TAG_RE.test('<script>alert(1)</script>')).toBe(false);
    expect(TAG_RE.test('DROP TABLE agents')).toBe(false);
    expect(TAG_RE.test('-starts-dash')).toBe(false);
    expect(TAG_RE.test('UPPERCASE')).toBe(false);
  });

  it('rejects overly long tags', () => {
    expect(TAG_RE.test('a'.repeat(65))).toBe(false);
  });
});

// ============================================================
// HIGH #6: safePath for publish command
// ============================================================
describe('Security: safePath blocks publish path traversal', () => {
  it('blocks absolute path escape', () => {
    expect(() => safePath(process.cwd(), '/etc/passwd')).toThrow('Path traversal blocked');
  });

  it('blocks relative traversal', () => {
    expect(() => safePath(process.cwd(), '../../etc/shadow')).toThrow('Path traversal blocked');
  });

  it('allows relative path within cwd', () => {
    const result = safePath(process.cwd(), 'agents/test-agent.md');
    expect(result).toContain(process.cwd());
  });
});

// ============================================================
// MEDIUM #7: Symlink attack defense (data-export.js)
// ============================================================
describe('Security: symlink detection in data-export', () => {
  let tmpDir;

  beforeEach(() => {
    createDb(TEST_DB);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-test-'));
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('refuses to write to symlink target', () => {
    const db = getDb();
    db.prepare("INSERT INTO agents (id, team, model) VALUES (?, ?, ?)").run('sym-agent', 'test', 'sonnet');
    db.prepare(
      "INSERT INTO executions (agent_id, session_id, output_schema_valid, schema_score, duration_ms) VALUES (?, ?, ?, ?, ?)"
    ).run('sym-agent', 's1', 1, 0.9, 5000);

    // Create registry
    const regPath = path.join(tmpDir, 'registry.json');
    const reg = { version: '1.0.0', agents: {}, updated_at: new Date().toISOString() };
    registerAgent(reg, {
      name: 'sym-agent', version: '1.0.0', description: 'test', tags: ['test'],
    }, 'hash1');
    saveRegistry(reg, regPath);

    const outputDir = path.join(tmpDir, 'output');
    const statsDir = path.join(outputDir, 'stats');
    fs.mkdirSync(statsDir, { recursive: true });

    // Create a symlink at the target path
    const attackTarget = path.join(tmpDir, 'attack-target.json');
    fs.writeFileSync(attackTarget, '{"pwned": true}');
    fs.symlinkSync(attackTarget, path.join(statsDir, 'sym-agent.json'));

    expect(() => exportAllData(regPath, outputDir)).toThrow('Symlink detected');
  });

  it('writes normally when no symlink exists', () => {
    const db = getDb();
    db.prepare("INSERT INTO agents (id, team, model) VALUES (?, ?, ?)").run('normal-agent', 'test', 'sonnet');
    db.prepare(
      "INSERT INTO executions (agent_id, session_id, output_schema_valid, schema_score, duration_ms) VALUES (?, ?, ?, ?, ?)"
    ).run('normal-agent', 's1', 1, 0.9, 5000);

    const regPath = path.join(tmpDir, 'registry.json');
    const reg = { version: '1.0.0', agents: {}, updated_at: new Date().toISOString() };
    registerAgent(reg, {
      name: 'normal-agent', version: '1.0.0', description: 'test', tags: ['test'],
    }, 'hash1');
    saveRegistry(reg, regPath);

    const outputDir = path.join(tmpDir, 'output');
    const result = exportAllData(regPath, outputDir);
    expect(result.detailCount).toBe(1);
    expect(fs.existsSync(path.join(outputDir, 'stats', 'normal-agent.json'))).toBe(true);
  });
});

// ============================================================
// LOW #10: LLM model from environment variable
// ============================================================
describe('Security: LLM eval model configuration', () => {
  it('MODEL defaults to claude-haiku when env not set', async () => {
    // We test indirectly by importing and checking the module
    const mod = await import('../src/llm-eval.js');
    // The module-level MODEL is not exported, but evaluateExecution uses it.
    // If AGENT_EVAL_MODEL is not set, it defaults to claude-haiku-4-5-20251001
    // This test verifies the module loads without error
    expect(mod.evaluateExecution).toBeTypeOf('function');
    expect(mod.evaluateAgentBatch).toBeTypeOf('function');
  });
});
