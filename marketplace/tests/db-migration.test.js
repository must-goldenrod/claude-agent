import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(import.meta.dirname, 'test-migration.db');

describe('DB Migration - Phase 5A', () => {
  beforeEach(() => { createDb(TEST_DB); });
  afterEach(() => { closeDb(); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); });

  it('executions table has new columns', () => {
    const db = getDb();
    const cols = db.prepare("PRAGMA table_info(executions)").all();
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('output_length');
    expect(colNames).toContain('token_estimate');
    expect(colNames).toContain('call_order');
    expect(colNames).toContain('project_type');
    expect(colNames).toContain('model_version');
  });

  it('agent_profiles table exists with correct schema', () => {
    const db = getDb();
    const cols = db.prepare("PRAGMA table_info(agent_profiles)").all();
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('agent_id');
    expect(colNames).toContain('quality_score');
    expect(colNames).toContain('efficiency_score');
    expect(colNames).toContain('reliability_score');
    expect(colNames).toContain('impact_score');
    expect(colNames).toContain('composite_score');
    expect(colNames).toContain('context');
  });

  it('profile_history table exists', () => {
    const db = getDb();
    const cols = db.prepare("PRAGMA table_info(profile_history)").all();
    expect(cols.length).toBeGreaterThan(0);
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('snapshot_date');
  });

  it('migration is idempotent (createDb twice does not error)', () => {
    closeDb();
    expect(() => createDb(TEST_DB)).not.toThrow();
    expect(() => { closeDb(); createDb(TEST_DB); }).not.toThrow();
  });
});
