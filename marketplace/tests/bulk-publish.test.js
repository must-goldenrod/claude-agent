import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bulkPublish } from '../src/bulk-publish.js';
import { loadRegistry } from '../src/registry.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'bulk-test-' + Date.now());
const AGENTS_DIR = path.join(TEST_DIR, 'agents');
const REGISTRY_DIR = path.join(TEST_DIR, 'registry');

describe('Bulk Publish', () => {
  beforeEach(() => {
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
    for (const name of ['agent-a', 'agent-b']) {
      fs.writeFileSync(path.join(AGENTS_DIR, `${name}.md`), `---
name: ${name}
description: ${name} description
model: sonnet
---

# ${name}`);
    }
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('publishes all agents from directory', () => {
    const results = bulkPublish(AGENTS_DIR, REGISTRY_DIR, { version: '1.0.0', author: 'tester' });
    expect(results.published).toBe(2);
    expect(results.errors).toBe(0);

    const reg = loadRegistry(path.join(REGISTRY_DIR, 'registry.json'));
    expect(Object.keys(reg.agents)).toHaveLength(2);
    expect(reg.agents['agent-a']).toBeDefined();
    expect(reg.agents['agent-b']).toBeDefined();
  });

  it('skips files without frontmatter', () => {
    fs.writeFileSync(path.join(AGENTS_DIR, 'no-fm.md'), '# No frontmatter');
    const results = bulkPublish(AGENTS_DIR, REGISTRY_DIR, { version: '1.0.0' });
    expect(results.published).toBe(2);
    expect(results.skipped).toBe(1);
  });
});
