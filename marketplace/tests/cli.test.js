import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, closeDb } from '../src/db.js';
import { recordExecution } from '../src/tracker.js';
import { formatStats, formatExecutions } from '../src/cli.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(import.meta.dirname, 'test-cli.db');

describe('CLI Formatters', () => {
  beforeEach(() => {
    createDb(TEST_DB);
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('formatStats returns readable string', () => {
    recordExecution({
      agentId: 'test-agent',
      output: JSON.stringify({
        agent: 'test-agent', team: 'research', phase: 'testing',
        timestamp: new Date().toISOString(),
        findings: [], recommendations: [], confidence_score: 0.9,
        concerns: [], sources: []
      }),
      durationMs: 3000,
    });

    const output = formatStats('test-agent');
    expect(output).toContain('test-agent');
    expect(output).toContain('1');
    expect(output).toContain('Composite');
  });

  it('formatExecutions returns table-like output', () => {
    recordExecution({
      agentId: 'list-agent',
      output: '{}',
      durationMs: 1500,
    });

    const output = formatExecutions('list-agent', 10);
    expect(output).toContain('list-agent');
  });

  it('formatStats handles unknown agent', () => {
    const output = formatStats('nonexistent');
    expect(output).toContain('0');
  });
});
