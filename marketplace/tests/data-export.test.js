import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import { loadRegistry, saveRegistry, registerAgent } from '../src/registry.js';
import { exportSummary, exportAgentsList, exportAgentDetail, exportTeams, exportLeaderboard, exportAllData } from '../src/data-export.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DB = path.join(import.meta.dirname, 'test-export.db');

describe('Data Export', () => {
  let tmpDir;

  beforeEach(() => {
    createDb(TEST_DB);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-export-'));

    // Seed test data
    const db = getDb();
    db.prepare("INSERT INTO agents (id, team, model) VALUES (?, ?, ?)").run('test-agent', 'security', 'sonnet');
    db.prepare("INSERT INTO executions (agent_id, session_id, output_schema_valid, schema_score, duration_ms, output_length, token_estimate, project_type, model_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run('test-agent', 's1', 1, 0.9, 5000, 200, 50, 'typescript', 'sonnet');
    db.prepare("INSERT INTO executions (agent_id, session_id, output_schema_valid, schema_score, duration_ms, output_length, token_estimate, project_type, model_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run('test-agent', 's2', 1, 0.85, 6000, 250, 63, 'typescript', 'sonnet');
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeTestRegistry() {
    const regPath = path.join(tmpDir, 'registry.json');
    const reg = { version: '1.0.0', agents: {}, updated_at: new Date().toISOString() };
    registerAgent(reg, {
      name: 'test-agent',
      version: '1.0.0',
      description: 'A test agent',
      tags: ['security'],
      model_recommendation: 'sonnet',
      performance: { quality: 0.8, efficiency: 0.7, reliability: 0.9, impact: 0.6, composite: 0.77, sample_size: 10 },
    }, 'hash1');
    registerAgent(reg, {
      name: 'other-agent',
      version: '0.1.0',
      description: 'Another agent',
      tags: ['code'],
    }, 'hash2');
    saveRegistry(reg, regPath);
    return { reg, regPath };
  }

  it('exportSummary returns correct stats', () => {
    const { reg } = makeTestRegistry();
    const summary = exportSummary(reg);
    expect(summary.total_agents).toBe(2);
    expect(summary.total_executions).toBe(2);
    expect(summary.generated_at).toBeTruthy();
  });

  it('exportAgentsList returns sorted agents with performance', () => {
    const { reg } = makeTestRegistry();
    const agents = exportAgentsList(reg);
    expect(agents).toHaveLength(2);
    // test-agent has performance, should be first (higher composite)
    expect(agents[0].name).toBe('test-agent');
    expect(agents[0].composite).toBeTruthy();
  });

  it('exportAgentDetail returns profile and executions', () => {
    const detail = exportAgentDetail('test-agent');
    expect(detail.agentId).toBe('test-agent');
    expect(detail.profile).toBeDefined();
    expect(detail.executions).toHaveLength(2);
  });

  it('exportTeams groups agents by tag', () => {
    const { reg } = makeTestRegistry();
    const teams = exportTeams(reg);
    expect(teams.length).toBeGreaterThanOrEqual(2);
    const securityTeam = teams.find(t => t.name === 'security');
    expect(securityTeam).toBeDefined();
    expect(securityTeam.agents).toContain('test-agent');
  });

  it('exportLeaderboard returns ranked agents with performance', () => {
    const { reg } = makeTestRegistry();
    const board = exportLeaderboard(reg);
    expect(board).toHaveLength(1); // only test-agent has performance
    expect(board[0].rank).toBe(1);
    expect(board[0].name).toBe('test-agent');
    expect(board[0].composite).toBe(0.77);
  });

  it('exportAllData writes all JSON files', () => {
    const { regPath } = makeTestRegistry();
    const outputDir = path.join(tmpDir, 'output');
    const result = exportAllData(regPath, outputDir);

    expect(result.agentCount).toBe(2);
    expect(result.teamCount).toBeGreaterThanOrEqual(1);

    expect(fs.existsSync(path.join(outputDir, 'summary.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'agents.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'teams.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'leaderboard.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'stats', 'test-agent.json'))).toBe(true);

    const summary = JSON.parse(fs.readFileSync(path.join(outputDir, 'summary.json'), 'utf8'));
    expect(summary.total_agents).toBe(2);
  });
});
