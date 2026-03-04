# Agent Marketplace Phase 3: Registry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 에이전트를 패키징하고, Git 기반 레지스트리에 등록/검색/설치할 수 있는 시스템 구축

**Architecture:** 로컬 .claude/agents/ 에이전트를 표준 패키지(agent.md + meta.json)로 변환. 레지스트리는 JSON 인덱스 파일. CLI로 install/publish/search.

**Tech Stack:** Node.js, fs, crypto (해싱), commander.js, semver

---

### Task 1: semver 의존성 추가

**Files:**
- Modify: `marketplace/package.json`

**Step 1: 설치**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent/marketplace
npm install semver
```

**Step 2: Commit**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent
git add marketplace/package.json marketplace/package-lock.json
git commit -m "chore(marketplace): add semver dependency"
```

---

### Task 2: 에이전트 패키저 모듈

**Files:**
- Test: `marketplace/tests/packager.test.js`
- Create: `marketplace/src/packager.js`

기존 .claude/agents/*.md 파일에서 frontmatter를 파싱하여 agent.meta.json을 생성하는 모듈.

**Step 1: 테스트 작성**

Create `marketplace/tests/packager.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { parseFrontmatter, buildMeta, computeContentHash } from '../src/packager.js';

const SAMPLE_AGENT_MD = `---
name: security-auditor
description: Reviews code for OWASP Top 10 vulnerabilities
tools: Read, Grep, Glob, Bash, Write
model: sonnet
color: red
---

# Security Auditor

You are the Security Auditor.`;

describe('Packager', () => {
  it('parseFrontmatter extracts YAML fields', () => {
    const fm = parseFrontmatter(SAMPLE_AGENT_MD);
    expect(fm.name).toBe('security-auditor');
    expect(fm.description).toContain('OWASP');
    expect(fm.model).toBe('sonnet');
    expect(fm.color).toBe('red');
  });

  it('parseFrontmatter returns null for no frontmatter', () => {
    const fm = parseFrontmatter('# No frontmatter here');
    expect(fm).toBeNull();
  });

  it('buildMeta creates valid meta.json structure', () => {
    const fm = parseFrontmatter(SAMPLE_AGENT_MD);
    const meta = buildMeta(fm, { version: '1.0.0', author: 'mufin', tags: ['security', 'owasp'] });
    expect(meta.name).toBe('security-auditor');
    expect(meta.version).toBe('1.0.0');
    expect(meta.author).toBe('mufin');
    expect(meta.tags).toEqual(['security', 'owasp']);
    expect(meta.model_recommendation).toBe('sonnet');
    expect(meta.license).toBe('MIT');
  });

  it('computeContentHash produces consistent hash', () => {
    const h1 = computeContentHash(SAMPLE_AGENT_MD);
    const h2 = computeContentHash(SAMPLE_AGENT_MD);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(16);
  });

  it('computeContentHash changes when content changes', () => {
    const h1 = computeContentHash(SAMPLE_AGENT_MD);
    const h2 = computeContentHash(SAMPLE_AGENT_MD + '\nmodified');
    expect(h1).not.toBe(h2);
  });
});
```

**Step 2: 구현**

Create `marketplace/src/packager.js`:
```js
import crypto from 'crypto';

export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fields = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    fields[key] = value;
  }
  return fields;
}

export function buildMeta(frontmatter, overrides = {}) {
  return {
    name: frontmatter.name,
    display_name: frontmatter.name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
    version: overrides.version || '0.1.0',
    description: frontmatter.description || '',
    author: overrides.author || 'unknown',
    license: overrides.license || 'MIT',
    tags: overrides.tags || [],
    team_compatibility: frontmatter.team ? [frontmatter.team] : [],
    model_recommendation: frontmatter.model || 'sonnet',
    avg_score: null,
    total_executions: 0,
    dependencies: [],
    claude_code_version: '>=1.0.0',
  };
}

export function computeContentHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}
```

**Step 3: 테스트**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent/marketplace && npx vitest run tests/packager.test.js
```

**Step 4: Commit**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent
git add marketplace/src/packager.js marketplace/tests/packager.test.js
git commit -m "feat(marketplace): add agent packager module"
```

---

### Task 3: 레지스트리 모듈

**Files:**
- Test: `marketplace/tests/registry.test.js`
- Create: `marketplace/src/registry.js`

로컬 레지스트리 인덱스(registry.json)를 관리. 에이전트 등록/검색/조회.

**Step 1: 테스트 작성**

Create `marketplace/tests/registry.test.js`:
```js
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
```

**Step 2: 구현**

Create `marketplace/src/registry.js`:
```js
import fs from 'fs';

export function loadRegistry(registryPath) {
  if (fs.existsSync(registryPath)) {
    return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  }
  return { version: '1.0.0', agents: {}, updated_at: new Date().toISOString() };
}

export function saveRegistry(registry, registryPath) {
  registry.updated_at = new Date().toISOString();
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

export function registerAgent(registry, meta, contentHash) {
  const name = meta.name;
  if (!registry.agents[name]) {
    registry.agents[name] = {
      name,
      description: meta.description || '',
      tags: meta.tags || [],
      model_recommendation: meta.model_recommendation,
      latest: meta.version,
      versions: {},
    };
  }

  registry.agents[name].latest = meta.version;
  registry.agents[name].description = meta.description || registry.agents[name].description;
  registry.agents[name].tags = meta.tags || registry.agents[name].tags;

  registry.agents[name].versions[meta.version] = {
    content_hash: contentHash,
    published_at: new Date().toISOString(),
  };
}

export function searchAgents(registry, query, opts = {}) {
  const results = [];
  for (const entry of Object.values(registry.agents)) {
    const matchesQuery = !query ||
      entry.name.includes(query) ||
      (entry.description && entry.description.includes(query));
    const matchesTag = !opts.tag || (entry.tags && entry.tags.includes(opts.tag));

    if (matchesQuery && matchesTag) {
      results.push(entry);
    }
  }
  return results;
}

export function getAgentEntry(registry, name) {
  return registry.agents[name] || null;
}

export function listAllAgents(registry) {
  return Object.values(registry.agents).sort((a, b) => a.name.localeCompare(b.name));
}
```

**Step 3: 테스트**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent/marketplace && npx vitest run tests/registry.test.js
```

**Step 4: Commit**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent
git add marketplace/src/registry.js marketplace/tests/registry.test.js
git commit -m "feat(marketplace): add registry module for agent indexing and search"
```

---

### Task 4: install/publish CLI 명령어

**Files:**
- Test: `marketplace/tests/cli-registry.test.js`
- Create: `marketplace/src/installer.js`
- Modify: `marketplace/bin/agent-tracker.js`

**Step 1: installer 테스트 작성**

Create `marketplace/tests/cli-registry.test.js`:
```js
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
```

**Step 2: installer 구현**

Create `marketplace/src/installer.js`:
```js
import fs from 'fs';
import path from 'path';
import { parseFrontmatter, buildMeta, computeContentHash } from './packager.js';

export function installAgent(agentName, registryDir, targetDir) {
  const agentDir = path.join(registryDir, 'agents', agentName);
  const agentFile = path.join(agentDir, 'agent.md');

  if (!fs.existsSync(agentFile)) {
    return { success: false, error: `Agent '${agentName}' not found in registry` };
  }

  const content = fs.readFileSync(agentFile, 'utf8');
  const targetPath = path.join(targetDir, `${agentName}.md`);

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(targetPath, content);

  return { success: true, path: targetPath };
}

export function exportAgent(agentFilePath, outputDir, overrides = {}) {
  if (!fs.existsSync(agentFilePath)) {
    return { success: false, error: `File not found: ${agentFilePath}` };
  }

  const content = fs.readFileSync(agentFilePath, 'utf8');
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    return { success: false, error: 'No frontmatter found in agent file' };
  }

  const meta = buildMeta(frontmatter, overrides);
  meta.content_hash = computeContentHash(content);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'agent.md'), content);
  fs.writeFileSync(path.join(outputDir, 'agent.meta.json'), JSON.stringify(meta, null, 2));

  return { success: true, meta };
}
```

**Step 3: CLI 명령어 추가**

Add to `marketplace/bin/agent-tracker.js` — import at top:
```js
import { installAgent, exportAgent } from '../src/installer.js';
import { loadRegistry, saveRegistry, registerAgent, searchAgents, listAllAgents } from '../src/registry.js';
import { parseFrontmatter, computeContentHash } from '../src/packager.js';
import path from 'path';
import fs from 'fs';
```

Add before `program.parse()`:
```js
const DEFAULT_REGISTRY = path.join(process.cwd(), 'registry');
const DEFAULT_AGENTS = path.join(process.cwd(), '.claude', 'agents');

const marketCmd = program.command('market').description('Agent marketplace operations');

marketCmd
  .command('search <query>')
  .description('Search for agents in registry')
  .option('-t, --tag <tag>', 'Filter by tag')
  .option('-r, --registry <path>', 'Registry directory', DEFAULT_REGISTRY)
  .action((query, opts) => {
    const reg = loadRegistry(path.join(opts.registry, 'registry.json'));
    const results = searchAgents(reg, query, { tag: opts.tag });
    if (results.length === 0) {
      console.log('No agents found.');
      return;
    }
    for (const r of results) {
      console.log(`${r.name}@${r.latest} - ${r.description || '(no description)'}`);
      if (r.tags.length) console.log(`  tags: ${r.tags.join(', ')}`);
    }
  });

marketCmd
  .command('install <agent-name>')
  .description('Install agent from registry to .claude/agents/')
  .option('-r, --registry <path>', 'Registry directory', DEFAULT_REGISTRY)
  .option('-d, --dir <path>', 'Target agents directory', DEFAULT_AGENTS)
  .action((agentName, opts) => {
    const result = installAgent(agentName, opts.registry, opts.dir);
    if (result.success) {
      console.log(`Installed ${agentName} -> ${result.path}`);
    } else {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
  });

marketCmd
  .command('publish <agent-file>')
  .description('Export agent as a package for the registry')
  .option('-v, --version <version>', 'Version', '0.1.0')
  .option('-a, --author <name>', 'Author name', 'unknown')
  .option('-t, --tags <tags>', 'Comma-separated tags', '')
  .option('-o, --output <dir>', 'Output directory')
  .option('-r, --registry <path>', 'Registry directory', DEFAULT_REGISTRY)
  .action((agentFile, opts) => {
    const tags = opts.tags ? opts.tags.split(',').map(t => t.trim()) : [];
    const agentPath = path.resolve(agentFile);
    const content = fs.readFileSync(agentPath, 'utf8');
    const fm = parseFrontmatter(content);
    const agentName = fm?.name || path.basename(agentFile, '.md');
    const outputDir = opts.output || path.join(opts.registry, 'agents', agentName);

    const result = exportAgent(agentPath, outputDir, {
      version: opts.version, author: opts.author, tags,
    });

    if (!result.success) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    // Update registry index
    const registryPath = path.join(opts.registry, 'registry.json');
    const reg = loadRegistry(registryPath);
    registerAgent(reg, result.meta, computeContentHash(content));
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    saveRegistry(reg, registryPath);

    console.log(`Published ${agentName}@${opts.version} -> ${outputDir}`);
  });

marketCmd
  .command('list')
  .description('List all agents in registry')
  .option('-r, --registry <path>', 'Registry directory', DEFAULT_REGISTRY)
  .action((opts) => {
    const reg = loadRegistry(path.join(opts.registry, 'registry.json'));
    const agents = listAllAgents(reg);
    if (agents.length === 0) {
      console.log('No agents in registry.');
      return;
    }
    const header = 'Name | Version | Tags | Description';
    const sep = '-----|---------|------|------------';
    const rows = agents.map(a =>
      `${a.name} | ${a.latest} | ${(a.tags || []).join(',')} | ${(a.description || '').slice(0, 50)}`
    );
    console.log([header, sep, ...rows].join('\n'));
  });
```

**Step 4: 테스트**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent/marketplace && npx vitest run
```

**Step 5: Commit**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent
git add marketplace/src/installer.js marketplace/tests/cli-registry.test.js marketplace/bin/agent-tracker.js
git commit -m "feat(marketplace): add install/publish/search CLI commands"
```

---

### Task 5: bulk publish 유틸리티

**Files:**
- Test: `marketplace/tests/bulk-publish.test.js`
- Create: `marketplace/src/bulk-publish.js`

기존 .claude/agents/ 의 모든 에이전트를 한번에 레지스트리로 내보내는 유틸리티.

**Step 1: 테스트 작성**

Create `marketplace/tests/bulk-publish.test.js`:
```js
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
    // Create sample agents
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
```

**Step 2: 구현**

Create `marketplace/src/bulk-publish.js`:
```js
import fs from 'fs';
import path from 'path';
import { exportAgent } from './installer.js';
import { loadRegistry, saveRegistry, registerAgent } from './registry.js';
import { parseFrontmatter, computeContentHash } from './packager.js';

export function bulkPublish(agentsDir, registryDir, overrides = {}) {
  const registryPath = path.join(registryDir, 'registry.json');
  const reg = loadRegistry(registryPath);

  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  let published = 0;
  let errors = 0;
  let skipped = 0;

  for (const file of files) {
    const agentPath = path.join(agentsDir, file);
    const content = fs.readFileSync(agentPath, 'utf8');
    const fm = parseFrontmatter(content);

    if (!fm || !fm.name) {
      skipped++;
      continue;
    }

    const outputDir = path.join(registryDir, 'agents', fm.name);
    const result = exportAgent(agentPath, outputDir, overrides);

    if (result.success) {
      registerAgent(reg, result.meta, computeContentHash(content));
      published++;
    } else {
      errors++;
    }
  }

  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  saveRegistry(reg, registryPath);

  return { published, errors, skipped, total: files.length };
}
```

**Step 3: CLI에 bulk-publish 명령어 추가**

Add to agent-tracker.js before `program.parse()`:
```js
import { bulkPublish } from '../src/bulk-publish.js';

marketCmd
  .command('bulk-publish <agents-dir>')
  .description('Publish all agents from a directory')
  .option('-v, --version <version>', 'Version for all agents', '0.1.0')
  .option('-a, --author <name>', 'Author name', 'unknown')
  .option('-r, --registry <path>', 'Registry directory', DEFAULT_REGISTRY)
  .action((agentsDir, opts) => {
    const results = bulkPublish(path.resolve(agentsDir), opts.registry, {
      version: opts.version, author: opts.author,
    });
    console.log(`Published: ${results.published}, Skipped: ${results.skipped}, Errors: ${results.errors}`);
  });
```

**Step 4: 테스트**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent/marketplace && npx vitest run
```

**Step 5: Commit**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent
git add marketplace/src/bulk-publish.js marketplace/tests/bulk-publish.test.js marketplace/bin/agent-tracker.js
git commit -m "feat(marketplace): add bulk-publish for batch agent registration"
```

---

### Task 6: 통합 테스트 + 문서

**Files:**
- Modify: `marketplace/tests/integration.test.js`
- Modify: `CLAUDE.md`

**Step 1: 레지스트리 통합 테스트 추가**

Add test to integration.test.js:
```js
import { exportAgent, installAgent } from '../src/installer.js';
import { loadRegistry, saveRegistry, registerAgent, searchAgents } from '../src/registry.js';
import { parseFrontmatter, computeContentHash } from '../src/packager.js';

it('registry pipeline: export -> register -> search -> install', () => {
  const tmpDir = path.join(import.meta.dirname, 'test-registry-int-' + Date.now());
  const registryDir = path.join(tmpDir, 'registry');
  const installDir = path.join(tmpDir, 'install');
  const agentFile = path.join(tmpDir, 'agent.md');

  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(agentFile, `---
name: int-test-agent
description: Integration test agent
model: sonnet
---

# Int Test Agent

You are a test agent.`);

  // Export
  const outputDir = path.join(registryDir, 'agents', 'int-test-agent');
  const exportResult = exportAgent(agentFile, outputDir, { version: '1.0.0', author: 'tester', tags: ['test'] });
  expect(exportResult.success).toBe(true);

  // Register
  const registryPath = path.join(registryDir, 'registry.json');
  const reg = loadRegistry(registryPath);
  const content = fs.readFileSync(agentFile, 'utf8');
  registerAgent(reg, exportResult.meta, computeContentHash(content));
  saveRegistry(reg, registryPath);

  // Search
  const results = searchAgents(reg, 'int-test');
  expect(results).toHaveLength(1);
  expect(results[0].name).toBe('int-test-agent');

  // Install
  const installResult = installAgent('int-test-agent', registryDir, installDir);
  expect(installResult.success).toBe(true);
  expect(fs.existsSync(path.join(installDir, 'int-test-agent.md'))).toBe(true);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```

**Step 2: CLAUDE.md 업데이트**

Add marketplace commands to CLAUDE.md:
```markdown
- `node marketplace/bin/agent-tracker.js market search <query>` — 에이전트 검색
- `node marketplace/bin/agent-tracker.js market install <name>` — 에이전트 설치
- `node marketplace/bin/agent-tracker.js market publish <file>` — 에이전트 공개
- `node marketplace/bin/agent-tracker.js market bulk-publish <dir>` — 일괄 공개
- `node marketplace/bin/agent-tracker.js market list` — 레지스트리 목록
```

**Step 3: 전체 테스트**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent/marketplace && npx vitest run
```

**Step 4: Commit**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent
git add marketplace/tests/integration.test.js CLAUDE.md
git commit -m "feat(marketplace): add Phase 3 registry integration test and docs"
```

---

## 태스크 요약

| Task | 내용 | 파일 수 |
|------|------|---------|
| 1 | semver 의존성 | 1 |
| 2 | 패키저 모듈 | 2 |
| 3 | 레지스트리 모듈 | 2 |
| 4 | install/publish CLI | 3 |
| 5 | bulk-publish 유틸리티 | 3 |
| 6 | 통합 테스트 + 문서 | 2 |

**총 6개 태스크, ~13개 파일, ~6 커밋**
