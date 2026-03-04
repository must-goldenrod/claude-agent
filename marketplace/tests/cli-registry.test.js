import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installAgent, exportAgent } from '../src/installer.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'agent-market-test-' + Date.now());
const AGENTS_DIR = path.join(TEST_DIR, 'agents');
const REGISTRY_DIR = path.join(TEST_DIR, 'registry');

const SAMPLE_AGENT = `---
name: test-agent
description: A test agent
model: sonnet
color: blue
---

# Test Agent

You are a test agent.`;

describe('Installer', () => {
  beforeEach(() => {
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
    fs.mkdirSync(path.join(REGISTRY_DIR, 'agents', 'test-agent'), { recursive: true });
    fs.writeFileSync(path.join(REGISTRY_DIR, 'agents', 'test-agent', 'agent.md'), SAMPLE_AGENT);
    fs.writeFileSync(path.join(REGISTRY_DIR, 'agents', 'test-agent', 'agent.meta.json'), JSON.stringify({
      name: 'test-agent', version: '1.0.0', description: 'A test agent', tags: [],
    }));
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('installAgent copies agent.md to target directory', () => {
    const result = installAgent('test-agent', REGISTRY_DIR, AGENTS_DIR);
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(AGENTS_DIR, 'test-agent.md'))).toBe(true);
    const content = fs.readFileSync(path.join(AGENTS_DIR, 'test-agent.md'), 'utf8');
    expect(content).toContain('test-agent');
  });

  it('installAgent returns error for missing agent', () => {
    const result = installAgent('nonexistent', REGISTRY_DIR, AGENTS_DIR);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('exportAgent creates package from local agent file', () => {
    const agentPath = path.join(AGENTS_DIR, 'test-agent.md');
    fs.writeFileSync(agentPath, SAMPLE_AGENT);

    const outputDir = path.join(TEST_DIR, 'export');
    const result = exportAgent(agentPath, outputDir, { version: '1.0.0', author: 'tester', tags: ['test'] });
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'agent.md'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'agent.meta.json'))).toBe(true);

    const meta = JSON.parse(fs.readFileSync(path.join(outputDir, 'agent.meta.json'), 'utf8'));
    expect(meta.name).toBe('test-agent');
    expect(meta.version).toBe('1.0.0');
  });
});
