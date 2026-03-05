import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import { installAgent, getPublisherProfile } from '../src/installer.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DB = path.join(import.meta.dirname, 'test-install-profile.db');

describe('Install with publisher profile', () => {
  let tmpDir;

  beforeEach(() => {
    createDb(TEST_DB);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-profile-'));
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores publisher profile when meta has performance data', () => {
    // Set up fake registry
    const registryDir = path.join(tmpDir, 'registry');
    const agentDir = path.join(registryDir, 'agents', 'test-agent');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'agent.md'), '# Test Agent');
    fs.writeFileSync(path.join(agentDir, 'agent.meta.json'), JSON.stringify({
      name: 'test-agent',
      performance: {
        quality: 0.85,
        efficiency: 0.70,
        reliability: 0.90,
        impact: 0.60,
        composite: 0.79,
        sample_size: 50,
        context: { model: 'sonnet', domain: 'testing' },
      },
    }));

    const targetDir = path.join(tmpDir, 'agents');
    const result = installAgent('test-agent', registryDir, targetDir);
    expect(result.success).toBe(true);

    const pub = getPublisherProfile('test-agent');
    expect(pub).not.toBeNull();
    expect(pub.publisher_quality).toBe(0.85);
    expect(pub.publisher_composite).toBe(0.79);
    expect(pub.publisher_sample_size).toBe(50);
  });

  it('installs normally when no meta.json exists', () => {
    const registryDir = path.join(tmpDir, 'registry');
    const agentDir = path.join(registryDir, 'agents', 'no-meta-agent');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'agent.md'), '# No Meta');

    const targetDir = path.join(tmpDir, 'agents');
    const result = installAgent('no-meta-agent', registryDir, targetDir);
    expect(result.success).toBe(true);

    const pub = getPublisherProfile('no-meta-agent');
    expect(pub).toBeNull();
  });

  it('installs normally when meta has no performance field', () => {
    const registryDir = path.join(tmpDir, 'registry');
    const agentDir = path.join(registryDir, 'agents', 'basic-agent');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'agent.md'), '# Basic');
    fs.writeFileSync(path.join(agentDir, 'agent.meta.json'), JSON.stringify({
      name: 'basic-agent', version: '0.1.0',
    }));

    const targetDir = path.join(tmpDir, 'agents');
    const result = installAgent('basic-agent', registryDir, targetDir);
    expect(result.success).toBe(true);

    const pub = getPublisherProfile('basic-agent');
    expect(pub).toBeNull();
  });
});
