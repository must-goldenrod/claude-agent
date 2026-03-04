import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(import.meta.dirname, 'test.db');

describe('Database', () => {
  afterEach(() => {
    closeDb();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('creates database with all tables', () => {
    const db = createDb(TEST_DB);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);

    expect(tables).toContain('agents');
    expect(tables).toContain('executions');
    expect(tables).toContain('evaluations');
    expect(tables).toContain('agent_versions');
  });

  it('getDb returns same instance', () => {
    createDb(TEST_DB);
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
  });

  it('agents table has correct columns', () => {
    const db = createDb(TEST_DB);
    const info = db.prepare("PRAGMA table_info(agents)").all();
    const columns = info.map(c => c.name);
    expect(columns).toEqual(
      expect.arrayContaining(['id', 'version', 'source_path', 'team', 'model', 'created_at', 'updated_at'])
    );
  });

  it('executions table has correct columns', () => {
    const db = createDb(TEST_DB);
    const info = db.prepare("PRAGMA table_info(executions)").all();
    const columns = info.map(c => c.name);
    expect(columns).toEqual(
      expect.arrayContaining([
        'id', 'agent_id', 'session_id', 'pipeline_phase',
        'prompt_hash', 'output_hash', 'output_schema_valid',
        'duration_ms', 'timestamp', 'metadata'
      ])
    );
  });
});
