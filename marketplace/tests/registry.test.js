import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadRegistry,
  saveRegistry,
  registerAgent,
  searchAgents,
  getAgentEntry,
  listAllAgents,
} from '../src/registry.js';
import fs from 'fs';
import path from 'path';

const TEST_REGISTRY = path.join(import.meta.dirname, 'test-registry.json');

describe('Registry', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_REGISTRY)) fs.unlinkSync(TEST_REGISTRY);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_REGISTRY)) fs.unlinkSync(TEST_REGISTRY);
  });

  it('loadRegistry creates empty registry if file missing', () => {
    const reg = loadRegistry(TEST_REGISTRY);
    expect(reg.agents).toEqual({});
    expect(reg.version).toBe('1.0.0');
  });

  it('registerAgent adds agent to registry', () => {
    const reg = loadRegistry(TEST_REGISTRY);
    const meta = {
      name: 'security-auditor',
      version: '1.0.0',
      description: 'OWASP auditor',
      tags: ['security'],
      model_recommendation: 'sonnet',
    };
    registerAgent(reg, meta, 'abc123');
    saveRegistry(reg, TEST_REGISTRY);

    const loaded = loadRegistry(TEST_REGISTRY);
    expect(loaded.agents['security-auditor']).toBeDefined();
    expect(loaded.agents['security-auditor'].latest).toBe('1.0.0');
    expect(loaded.agents['security-auditor'].versions['1.0.0'].content_hash).toBe('abc123');
  });

  it('registerAgent updates version', () => {
    const reg = loadRegistry(TEST_REGISTRY);
    registerAgent(reg, { name: 'test', version: '1.0.0', tags: [] }, 'hash1');
    registerAgent(reg, { name: 'test', version: '1.1.0', tags: [] }, 'hash2');
    expect(reg.agents['test'].latest).toBe('1.1.0');
    expect(Object.keys(reg.agents['test'].versions)).toHaveLength(2);
  });

  it('searchAgents finds by name substring', () => {
    const reg = loadRegistry(TEST_REGISTRY);
    registerAgent(reg, { name: 'security-auditor', version: '1.0.0', description: 'sec', tags: ['security'] }, 'h1');
    registerAgent(reg, { name: 'code-reviewer', version: '1.0.0', description: 'code', tags: ['quality'] }, 'h2');
    registerAgent(reg, { name: 'api-security-auditor', version: '1.0.0', description: 'api sec', tags: ['security'] }, 'h3');

    const results = searchAgents(reg, 'security');
    expect(results).toHaveLength(2);
    expect(results.map(r => r.name)).toContain('security-auditor');
    expect(results.map(r => r.name)).toContain('api-security-auditor');
  });

  it('searchAgents finds by tag', () => {
    const reg = loadRegistry(TEST_REGISTRY);
    registerAgent(reg, { name: 'a', version: '1.0.0', tags: ['security'] }, 'h1');
    registerAgent(reg, { name: 'b', version: '1.0.0', tags: ['quality'] }, 'h2');

    const results = searchAgents(reg, '', { tag: 'security' });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('a');
  });

  it('getAgentEntry returns null for unknown agent', () => {
    const reg = loadRegistry(TEST_REGISTRY);
    expect(getAgentEntry(reg, 'nonexistent')).toBeNull();
  });

  it('listAllAgents returns sorted list', () => {
    const reg = loadRegistry(TEST_REGISTRY);
    registerAgent(reg, { name: 'b-agent', version: '1.0.0', tags: [] }, 'h1');
    registerAgent(reg, { name: 'a-agent', version: '1.0.0', tags: [] }, 'h2');

    const list = listAllAgents(reg);
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('a-agent');
  });
});
