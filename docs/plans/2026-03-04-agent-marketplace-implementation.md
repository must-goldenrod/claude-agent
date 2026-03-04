# Agent Marketplace MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 에이전트 실행을 자동 추적하고 스키마 검증으로 품질을 측정하는 MVP 시스템 구축

**Architecture:** Claude Code Hook(PostToolUse)이 Agent 도구 호출을 가로채 SQLite에 기록. 스키마 검증은 수집 시 즉시 실행. CLI로 데이터 조회.

**Tech Stack:** Node.js (v25), better-sqlite3, commander.js

---

### Task 1: 프로젝트 초기화

**Files:**
- Create: `marketplace/package.json`
- Create: `marketplace/.gitignore`

**Step 1: marketplace 디렉토리 생성 및 npm init**

```bash
mkdir -p marketplace
cd marketplace
npm init -y
```

**Step 2: 의존성 설치**

```bash
cd marketplace
npm install better-sqlite3 commander
npm install -D vitest
```

**Step 3: package.json scripts 설정**

`marketplace/package.json`의 scripts를 수정:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "bin": {
    "agent-tracker": "./bin/agent-tracker.js"
  }
}
```

**Step 4: .gitignore 생성**

Create `marketplace/.gitignore`:
```
node_modules/
*.db
```

**Step 5: Commit**

```bash
git add marketplace/package.json marketplace/.gitignore marketplace/package-lock.json
git commit -m "feat(marketplace): initialize project with better-sqlite3 and commander"
```

---

### Task 2: SQLite 데이터베이스 모듈

**Files:**
- Test: `marketplace/tests/db.test.js`
- Create: `marketplace/src/db.js`

**Step 1: 실패하는 테스트 작성**

Create `marketplace/tests/db.test.js`:
```js
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
```

**Step 2: 테스트 실패 확인**

```bash
cd marketplace && npx vitest run tests/db.test.js
```
Expected: FAIL — `../src/db.js` 모듈 없음

**Step 3: 구현**

Create `marketplace/src/db.js`:
```js
import Database from 'better-sqlite3';
import path from 'path';

let db = null;

const DEFAULT_DB_PATH = path.join(
  process.env.HOME, '.claude', 'agent-marketplace.db'
);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL DEFAULT '0.0.0',
  source_path TEXT,
  team TEXT,
  model TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  session_id TEXT,
  pipeline_phase TEXT,
  prompt_hash TEXT,
  output_hash TEXT,
  output_schema_valid INTEGER,
  schema_score REAL,
  duration_ms INTEGER,
  timestamp TEXT DEFAULT (datetime('now')),
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER REFERENCES executions(id),
  eval_type TEXT NOT NULL,
  score REAL,
  details TEXT,
  evaluator TEXT,
  timestamp TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_versions (
  agent_id TEXT NOT NULL,
  version TEXT NOT NULL,
  content_hash TEXT,
  changelog TEXT,
  avg_score REAL,
  execution_count INTEGER DEFAULT 0,
  released_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (agent_id, version)
);

CREATE INDEX IF NOT EXISTS idx_executions_agent ON executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_executions_timestamp ON executions(timestamp);
CREATE INDEX IF NOT EXISTS idx_evaluations_execution ON evaluations(execution_id);
`;

export function createDb(dbPath = DEFAULT_DB_PATH) {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call createDb() first.');
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
```

**Step 4: 테스트 통과 확인**

```bash
cd marketplace && npx vitest run tests/db.test.js
```
Expected: 4 tests PASS

**Step 5: Commit**

```bash
git add marketplace/src/db.js marketplace/tests/db.test.js
git commit -m "feat(marketplace): add SQLite database module with schema"
```

---

### Task 3: 스키마 검증 모듈

**Files:**
- Test: `marketplace/tests/validator.test.js`
- Create: `marketplace/src/validator.js`

**Step 1: 실패하는 테스트 작성**

Create `marketplace/tests/validator.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { validateAgentOutput } from '../src/validator.js';

const VALID_OUTPUT = {
  agent: 'security-auditor',
  team: 'security',
  phase: 'implementation',
  timestamp: '2026-03-04T10:00:00Z',
  input_summary: 'Review auth code',
  findings: [{ title: 'SQL Injection', detail: 'Found in login', evidence: 'line 42' }],
  recommendations: [{ action: 'Parameterize queries', priority: 'high', rationale: 'CWE-89' }],
  confidence_score: 0.85,
  concerns: [],
  sources: ['https://owasp.org']
};

describe('validateAgentOutput', () => {
  it('returns 1.0 for fully valid output', () => {
    const result = validateAgentOutput(JSON.stringify(VALID_OUTPUT));
    expect(result.score).toBe(1.0);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns 0.0 for invalid JSON', () => {
    const result = validateAgentOutput('not json');
    expect(result.score).toBe(0.0);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('JSON');
  });

  it('deducts for missing required fields', () => {
    const partial = { agent: 'test', team: 'research' };
    const result = validateAgentOutput(JSON.stringify(partial));
    expect(result.score).toBeLessThan(1.0);
    expect(result.score).toBeGreaterThan(0.0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('deducts for invalid confidence_score range', () => {
    const bad = { ...VALID_OUTPUT, confidence_score: 1.5 };
    const result = validateAgentOutput(JSON.stringify(bad));
    expect(result.score).toBeLessThan(1.0);
  });

  it('deducts for invalid priority enum', () => {
    const bad = {
      ...VALID_OUTPUT,
      recommendations: [{ action: 'Do it', priority: 'ASAP', rationale: 'why' }]
    };
    const result = validateAgentOutput(JSON.stringify(bad));
    expect(result.score).toBeLessThan(1.0);
  });

  it('validates debate team extensions', () => {
    const debate = {
      ...VALID_OUTPUT,
      team: 'debate',
      round: 1,
      position: 'opening',
      arguments: [{ claim: 'x', evidence: 'y', strength: 'strong' }],
      counterarguments: []
    };
    const result = validateAgentOutput(JSON.stringify(debate));
    expect(result.score).toBe(1.0);
  });

  it('handles empty string output', () => {
    const result = validateAgentOutput('');
    expect(result.score).toBe(0.0);
    expect(result.valid).toBe(false);
  });
});
```

**Step 2: 테스트 실패 확인**

```bash
cd marketplace && npx vitest run tests/validator.test.js
```
Expected: FAIL

**Step 3: 구현**

Create `marketplace/src/validator.js`:
```js
const REQUIRED_FIELDS = ['agent', 'team', 'phase', 'timestamp', 'findings', 'recommendations', 'confidence_score'];
const VALID_TEAMS = ['research', 'debate', 'synthesis', 'quality', 'security', 'code', 'testing', 'database', 'devops', 'docs', 'infra'];
const VALID_PHASES = ['idea-exploration', 'requirements', 'architecture', 'implementation', 'testing'];
const VALID_PRIORITIES = ['high', 'medium', 'low'];
const VALID_SEVERITIES = ['critical', 'important', 'minor'];

const TEAM_EXTENSIONS = {
  debate: ['round', 'position', 'arguments', 'counterarguments'],
  quality: ['verdict', 'checklist'],
};

export function validateAgentOutput(outputStr) {
  const errors = [];
  let totalChecks = 0;
  let passedChecks = 0;

  // Check 1: Valid JSON
  totalChecks++;
  let parsed;
  try {
    if (!outputStr || outputStr.trim() === '') throw new Error('Empty');
    parsed = JSON.parse(outputStr);
    passedChecks++;
  } catch {
    return { valid: false, score: 0.0, errors: ['Invalid JSON: cannot parse output'] };
  }

  // Check 2: Required fields
  for (const field of REQUIRED_FIELDS) {
    totalChecks++;
    if (parsed[field] !== undefined && parsed[field] !== null) {
      passedChecks++;
    } else {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check 3: Enum validations
  if (parsed.team) {
    totalChecks++;
    if (VALID_TEAMS.includes(parsed.team)) {
      passedChecks++;
    } else {
      errors.push(`Invalid team: ${parsed.team}`);
    }
  }

  if (parsed.phase) {
    totalChecks++;
    if (VALID_PHASES.includes(parsed.phase)) {
      passedChecks++;
    } else {
      errors.push(`Invalid phase: ${parsed.phase}`);
    }
  }

  // Check 4: confidence_score range
  if (parsed.confidence_score !== undefined) {
    totalChecks++;
    if (typeof parsed.confidence_score === 'number' &&
        parsed.confidence_score >= 0 && parsed.confidence_score <= 1) {
      passedChecks++;
    } else {
      errors.push(`confidence_score must be 0.0-1.0, got: ${parsed.confidence_score}`);
    }
  }

  // Check 5: findings array structure
  if (Array.isArray(parsed.findings)) {
    for (const f of parsed.findings) {
      totalChecks++;
      if (f.title && f.detail) {
        passedChecks++;
      } else {
        errors.push('Finding missing title or detail');
      }
    }
  }

  // Check 6: recommendations enum
  if (Array.isArray(parsed.recommendations)) {
    for (const r of parsed.recommendations) {
      if (r.priority) {
        totalChecks++;
        if (VALID_PRIORITIES.includes(r.priority)) {
          passedChecks++;
        } else {
          errors.push(`Invalid priority: ${r.priority}`);
        }
      }
    }
  }

  // Check 7: concerns severity enum
  if (Array.isArray(parsed.concerns)) {
    for (const c of parsed.concerns) {
      if (c.severity) {
        totalChecks++;
        if (VALID_SEVERITIES.includes(c.severity)) {
          passedChecks++;
        } else {
          errors.push(`Invalid severity: ${c.severity}`);
        }
      }
    }
  }

  // Check 8: Team-specific extensions
  const teamExt = TEAM_EXTENSIONS[parsed.team];
  if (teamExt) {
    for (const field of teamExt) {
      totalChecks++;
      if (parsed[field] !== undefined) {
        passedChecks++;
      } else {
        errors.push(`Team ${parsed.team} missing extension field: ${field}`);
      }
    }
  }

  const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) / 100 : 0;
  return { valid: errors.length === 0, score, errors };
}
```

**Step 4: 테스트 통과 확인**

```bash
cd marketplace && npx vitest run tests/validator.test.js
```
Expected: 7 tests PASS

**Step 5: Commit**

```bash
git add marketplace/src/validator.js marketplace/tests/validator.test.js
git commit -m "feat(marketplace): add agent output schema validator"
```

---

### Task 4: 실행 기록 저장 모듈

**Files:**
- Test: `marketplace/tests/tracker.test.js`
- Create: `marketplace/src/tracker.js`

**Step 1: 실패하는 테스트 작성**

Create `marketplace/tests/tracker.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import { recordExecution, getExecutions, getAgentStats } from '../src/tracker.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(import.meta.dirname, 'test-tracker.db');

describe('Tracker', () => {
  beforeEach(() => {
    createDb(TEST_DB);
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('records an execution and auto-registers agent', () => {
    const id = recordExecution({
      agentId: 'security-auditor',
      model: 'sonnet',
      sessionId: 'sess-1',
      pipelinePhase: 'implementation',
      promptPreview: 'Audit the auth code',
      output: JSON.stringify({
        agent: 'security-auditor',
        team: 'security',
        phase: 'implementation',
        timestamp: new Date().toISOString(),
        findings: [],
        recommendations: [],
        confidence_score: 0.8,
        concerns: [],
        sources: []
      }),
      durationMs: 5000,
    });

    expect(id).toBeGreaterThan(0);

    const agent = getDb().prepare('SELECT * FROM agents WHERE id = ?').get('security-auditor');
    expect(agent).toBeDefined();
    expect(agent.model).toBe('sonnet');
  });

  it('getExecutions returns recent executions', () => {
    recordExecution({ agentId: 'test-agent', output: '{}', durationMs: 1000 });
    recordExecution({ agentId: 'test-agent', output: '{}', durationMs: 2000 });

    const execs = getExecutions('test-agent');
    expect(execs).toHaveLength(2);
  });

  it('getAgentStats returns aggregated stats', () => {
    for (let i = 0; i < 3; i++) {
      recordExecution({
        agentId: 'stat-agent',
        output: JSON.stringify({
          agent: 'stat-agent', team: 'research', phase: 'testing',
          timestamp: new Date().toISOString(),
          findings: [], recommendations: [], confidence_score: 0.9,
          concerns: [], sources: []
        }),
        durationMs: 1000 + i * 500,
      });
    }

    const stats = getAgentStats('stat-agent');
    expect(stats.totalExecutions).toBe(3);
    expect(stats.avgDurationMs).toBeGreaterThan(0);
    expect(stats.avgSchemaScore).toBeGreaterThan(0);
  });
});
```

**Step 2: 테스트 실패 확인**

```bash
cd marketplace && npx vitest run tests/tracker.test.js
```
Expected: FAIL

**Step 3: 구현**

Create `marketplace/src/tracker.js`:
```js
import crypto from 'crypto';
import { getDb } from './db.js';
import { validateAgentOutput } from './validator.js';

function hash(str) {
  return crypto.createHash('sha256').update(str || '').digest('hex').slice(0, 16);
}

export function recordExecution({ agentId, model, sessionId, pipelinePhase, promptPreview, output, durationMs }) {
  const db = getDb();

  // Auto-register agent if not exists
  db.prepare(`
    INSERT OR IGNORE INTO agents (id, version, model) VALUES (?, '0.0.0', ?)
  `).run(agentId, model || 'unknown');

  // Validate output schema
  const validation = validateAgentOutput(output || '');

  // Record execution
  const result = db.prepare(`
    INSERT INTO executions (agent_id, session_id, pipeline_phase, prompt_hash, output_hash, output_schema_valid, schema_score, duration_ms, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    agentId,
    sessionId || null,
    pipelinePhase || null,
    hash(promptPreview),
    hash(output),
    validation.valid ? 1 : 0,
    validation.score,
    durationMs || null,
    JSON.stringify({
      prompt_preview: (promptPreview || '').slice(0, 200),
      validation_errors: validation.errors,
    })
  );

  // Also record schema evaluation
  db.prepare(`
    INSERT INTO evaluations (execution_id, eval_type, score, details, evaluator)
    VALUES (?, 'schema', ?, ?, 'auto')
  `).run(
    result.lastInsertRowid,
    validation.score,
    JSON.stringify({ errors: validation.errors }),
  );

  return Number(result.lastInsertRowid);
}

export function getExecutions(agentId, limit = 50) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM executions WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?
  `).all(agentId, limit);
}

export function getAgentStats(agentId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      COUNT(*) as totalExecutions,
      AVG(duration_ms) as avgDurationMs,
      AVG(schema_score) as avgSchemaScore,
      MIN(timestamp) as firstSeen,
      MAX(timestamp) as lastSeen
    FROM executions WHERE agent_id = ?
  `).get(agentId);

  return {
    totalExecutions: row.totalExecutions,
    avgDurationMs: Math.round(row.avgDurationMs || 0),
    avgSchemaScore: Math.round((row.avgSchemaScore || 0) * 100) / 100,
    firstSeen: row.firstSeen,
    lastSeen: row.lastSeen,
  };
}
```

**Step 4: 테스트 통과 확인**

```bash
cd marketplace && npx vitest run tests/tracker.test.js
```
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add marketplace/src/tracker.js marketplace/tests/tracker.test.js
git commit -m "feat(marketplace): add execution tracker with auto-registration"
```

---

### Task 5: Claude Code Hook 스크립트

**Files:**
- Create: `.claude/hooks/track-agent-execution.js`
- Test: `marketplace/tests/hook.test.js`

**Step 1: 실패하는 테스트 작성**

Create `marketplace/tests/hook.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { parseHookInput, shouldTrack } from '../src/hook-parser.js';

describe('Hook Parser', () => {
  it('parses valid Agent PostToolUse input', () => {
    const input = {
      tool_name: 'Agent',
      tool_input: {
        prompt: 'Audit the auth code for vulnerabilities',
        subagent_type: 'security-auditor',
        description: 'Audit code security',
        model: 'sonnet',
      },
      tool_output: '{"agent":"security-auditor","team":"security"}',
    };

    const parsed = parseHookInput(input);
    expect(parsed.agentId).toBe('security-auditor');
    expect(parsed.model).toBe('sonnet');
    expect(parsed.promptPreview).toBe('Audit the auth code for vulnerabilities');
    expect(parsed.output).toContain('security-auditor');
  });

  it('shouldTrack returns true for Agent tool', () => {
    expect(shouldTrack({ tool_name: 'Agent' })).toBe(true);
  });

  it('shouldTrack returns false for non-Agent tools', () => {
    expect(shouldTrack({ tool_name: 'Read' })).toBe(false);
    expect(shouldTrack({ tool_name: 'Bash' })).toBe(false);
  });

  it('handles missing fields gracefully', () => {
    const input = {
      tool_name: 'Agent',
      tool_input: { subagent_type: 'test' },
      tool_output: '',
    };
    const parsed = parseHookInput(input);
    expect(parsed.agentId).toBe('test');
    expect(parsed.model).toBeUndefined();
  });
});
```

**Step 2: 테스트 실패 확인**

```bash
cd marketplace && npx vitest run tests/hook.test.js
```
Expected: FAIL

**Step 3: Hook 파서 구현**

Create `marketplace/src/hook-parser.js`:
```js
export function shouldTrack(hookInput) {
  return hookInput?.tool_name === 'Agent';
}

export function parseHookInput(hookInput) {
  const toolInput = hookInput.tool_input || {};
  return {
    agentId: toolInput.subagent_type || toolInput.name || 'unknown',
    model: toolInput.model,
    promptPreview: toolInput.prompt,
    description: toolInput.description,
    output: hookInput.tool_output || '',
  };
}
```

**Step 4: 테스트 통과 확인**

```bash
cd marketplace && npx vitest run tests/hook.test.js
```
Expected: 4 tests PASS

**Step 5: Hook 스크립트 작성**

Create `.claude/hooks/track-agent-execution.js`:
```js
#!/usr/bin/env node

// Claude Code PostToolUse hook for tracking agent executions.
// Reads hook input from stdin, records to SQLite via marketplace modules.

import { createReadStream } from 'fs';
import { createDb } from '../../marketplace/src/db.js';
import { recordExecution } from '../../marketplace/src/tracker.js';
import { shouldTrack, parseHookInput } from '../../marketplace/src/hook-parser.js';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  let input;
  try {
    const raw = await readStdin();
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  if (!shouldTrack(input)) {
    process.exit(0);
  }

  try {
    createDb();
    const parsed = parseHookInput(input);
    recordExecution({
      agentId: parsed.agentId,
      model: parsed.model,
      sessionId: process.env.CLAUDE_SESSION_ID || null,
      promptPreview: parsed.promptPreview,
      output: parsed.output,
    });
  } catch (err) {
    process.stderr.write(`[agent-tracker] ${err.message}\n`);
  }
}

main();
```

**Step 6: Commit**

```bash
git add marketplace/src/hook-parser.js marketplace/tests/hook.test.js .claude/hooks/track-agent-execution.js
git commit -m "feat(marketplace): add PostToolUse hook for automatic execution tracking"
```

---

### Task 6: Hook 등록 (settings.json)

**Files:**
- Create or Modify: `.claude/settings.json`

**Step 1: settings.json에 hook 등록**

Create `.claude/settings.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": {
          "tool": "Agent"
        },
        "command": "node .claude/hooks/track-agent-execution.js"
      }
    ]
  }
}
```

**Step 2: hook 스크립트에 실행 권한 부여**

```bash
chmod +x .claude/hooks/track-agent-execution.js
```

**Step 3: Commit**

```bash
git add .claude/settings.json
git commit -m "feat(marketplace): register agent tracking hook in settings"
```

---

### Task 7: CLI 도구 — stats 명령어

**Files:**
- Test: `marketplace/tests/cli.test.js`
- Create: `marketplace/bin/agent-tracker.js`
- Create: `marketplace/src/cli.js`

**Step 1: 실패하는 테스트 작성**

Create `marketplace/tests/cli.test.js`:
```js
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
```

**Step 2: 테스트 실패 확인**

```bash
cd marketplace && npx vitest run tests/cli.test.js
```
Expected: FAIL

**Step 3: CLI 포매터 구현**

Create `marketplace/src/cli.js`:
```js
import { getAgentStats, getExecutions } from './tracker.js';
import { getDb } from './db.js';

export function formatStats(agentId) {
  const stats = getAgentStats(agentId);
  const lines = [
    `Agent: ${agentId}`,
    `Total Executions: ${stats.totalExecutions}`,
    `Avg Duration: ${stats.avgDurationMs}ms`,
    `Avg Schema Score: ${stats.avgSchemaScore}`,
    `First Seen: ${stats.firstSeen || 'never'}`,
    `Last Seen: ${stats.lastSeen || 'never'}`,
  ];
  return lines.join('\n');
}

export function formatExecutions(agentId, limit = 20) {
  const execs = getExecutions(agentId, limit);
  if (execs.length === 0) return `No executions found for ${agentId}`;

  const header = 'ID | Agent | Schema | Duration | Timestamp';
  const separator = '---|-------|--------|----------|----------';
  const rows = execs.map(e =>
    `${e.id} | ${e.agent_id} | ${e.schema_score?.toFixed(2) ?? 'N/A'} | ${e.duration_ms ?? '?'}ms | ${e.timestamp}`
  );

  return [header, separator, ...rows].join('\n');
}

export function formatAllAgents() {
  const db = getDb();
  const agents = db.prepare(`
    SELECT a.id, a.model, a.team,
      COUNT(e.id) as exec_count,
      AVG(e.schema_score) as avg_score
    FROM agents a
    LEFT JOIN executions e ON a.id = e.agent_id
    GROUP BY a.id
    ORDER BY exec_count DESC
  `).all();

  if (agents.length === 0) return 'No agents tracked yet.';

  const header = 'Agent | Model | Team | Executions | Avg Score';
  const separator = '------|-------|------|------------|----------';
  const rows = agents.map(a =>
    `${a.id} | ${a.model || '?'} | ${a.team || '?'} | ${a.exec_count} | ${a.avg_score?.toFixed(2) ?? 'N/A'}`
  );

  return [header, separator, ...rows].join('\n');
}
```

**Step 4: CLI 엔트리포인트 작성**

Create `marketplace/bin/agent-tracker.js`:
```js
#!/usr/bin/env node

import { Command } from 'commander';
import { createDb } from '../src/db.js';
import { formatStats, formatExecutions, formatAllAgents } from '../src/cli.js';

const program = new Command();

program
  .name('agent-tracker')
  .description('Track and evaluate Claude Code agent performance')
  .version('0.1.0');

program
  .command('stats <agent-id>')
  .description('Show performance stats for an agent')
  .action((agentId) => {
    createDb();
    console.log(formatStats(agentId));
  });

program
  .command('list [agent-id]')
  .description('List recent executions')
  .option('-n, --limit <number>', 'Number of executions to show', '20')
  .action((agentId, opts) => {
    createDb();
    if (agentId) {
      console.log(formatExecutions(agentId, parseInt(opts.limit)));
    } else {
      console.log(formatAllAgents());
    }
  });

program
  .command('agents')
  .description('List all tracked agents')
  .action(() => {
    createDb();
    console.log(formatAllAgents());
  });

program.parse();
```

**Step 5: 테스트 통과 확인**

```bash
cd marketplace && npx vitest run tests/cli.test.js
```
Expected: 3 tests PASS

**Step 6: Commit**

```bash
git add marketplace/bin/agent-tracker.js marketplace/src/cli.js marketplace/tests/cli.test.js
git commit -m "feat(marketplace): add CLI tool for agent stats and execution listing"
```

---

### Task 8: 통합 테스트

**Files:**
- Test: `marketplace/tests/integration.test.js`

**Step 1: 통합 테스트 작성**

Create `marketplace/tests/integration.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import { recordExecution, getAgentStats } from '../src/tracker.js';
import { shouldTrack, parseHookInput } from '../src/hook-parser.js';
import { formatStats } from '../src/cli.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(import.meta.dirname, 'test-integration.db');

describe('Integration: Hook -> Tracker -> CLI', () => {
  beforeEach(() => {
    createDb(TEST_DB);
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('full pipeline: hook input -> record -> stats -> display', () => {
    const hookInput = {
      tool_name: 'Agent',
      tool_input: {
        prompt: 'Review the authentication module for security vulnerabilities',
        subagent_type: 'security-auditor',
        model: 'sonnet',
      },
      tool_output: JSON.stringify({
        agent: 'security-auditor',
        team: 'security',
        phase: 'implementation',
        timestamp: '2026-03-04T10:00:00Z',
        input_summary: 'Reviewed auth module',
        findings: [
          { title: 'Weak password hashing', detail: 'Using MD5', evidence: 'auth.js:42' }
        ],
        recommendations: [
          { action: 'Switch to bcrypt', priority: 'high', rationale: 'CWE-328' }
        ],
        confidence_score: 0.9,
        concerns: [],
        sources: ['https://owasp.org']
      }),
    };

    // Step 1: Hook parses input
    expect(shouldTrack(hookInput)).toBe(true);
    const parsed = parseHookInput(hookInput);
    expect(parsed.agentId).toBe('security-auditor');

    // Step 2: Tracker records execution
    const execId = recordExecution({
      agentId: parsed.agentId,
      model: parsed.model,
      promptPreview: parsed.promptPreview,
      output: parsed.output,
      durationMs: 15000,
    });
    expect(execId).toBeGreaterThan(0);

    // Step 3: Verify schema evaluation was recorded
    const evals = getDb().prepare(
      'SELECT * FROM evaluations WHERE execution_id = ?'
    ).all(execId);
    expect(evals).toHaveLength(1);
    expect(evals[0].eval_type).toBe('schema');
    expect(evals[0].score).toBe(1.0);

    // Step 4: Stats are available
    const stats = getAgentStats('security-auditor');
    expect(stats.totalExecutions).toBe(1);
    expect(stats.avgSchemaScore).toBe(1.0);

    // Step 5: CLI can display
    const display = formatStats('security-auditor');
    expect(display).toContain('security-auditor');
    expect(display).toContain('1');
  });

  it('tracks multiple agents across sessions', () => {
    const agents = ['security-auditor', 'code-reviewer-impl', 'research-lead'];

    for (const agentId of agents) {
      for (let i = 0; i < 3; i++) {
        recordExecution({
          agentId,
          sessionId: `session-${i}`,
          output: JSON.stringify({
            agent: agentId, team: 'research', phase: 'testing',
            timestamp: new Date().toISOString(),
            findings: [], recommendations: [], confidence_score: 0.8,
            concerns: [], sources: []
          }),
          durationMs: 5000 + Math.random() * 5000,
        });
      }
    }

    for (const agentId of agents) {
      const stats = getAgentStats(agentId);
      expect(stats.totalExecutions).toBe(3);
    }

    const total = getDb().prepare('SELECT COUNT(*) as n FROM executions').get();
    expect(total.n).toBe(9);
  });
});
```

**Step 2: 전체 테스트 실행**

```bash
cd marketplace && npx vitest run
```
Expected: All tests PASS (db 4 + validator 7 + tracker 3 + hook 4 + cli 3 + integration 2 = 23 tests)

**Step 3: Commit**

```bash
git add marketplace/tests/integration.test.js
git commit -m "test(marketplace): add integration test for full tracking pipeline"
```

---

### Task 9: vitest 설정 및 ESM 지원

**Files:**
- Create: `marketplace/vitest.config.js`
- Modify: `marketplace/package.json`

**Step 1: vitest 설정 파일 작성**

Create `marketplace/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
  },
});
```

**Step 2: package.json에 type: module 추가**

`marketplace/package.json`에 `"type": "module"` 추가.

**Step 3: 전체 테스트 실행**

```bash
cd marketplace && npx vitest run
```
Expected: All tests PASS

**Step 4: Commit**

```bash
git add marketplace/vitest.config.js marketplace/package.json
git commit -m "chore(marketplace): add vitest config and ESM support"
```

---

### Task 10: 문서화

**Files:**
- Modify: `CLAUDE.md`

**Step 1: CLAUDE.md에 marketplace 섹션 추가**

```markdown
## Agent Marketplace (MVP)

`marketplace/` 디렉토리에 에이전트 성능 추적 시스템.

- Hook이 Agent 도구 호출을 자동 캡처 → SQLite에 저장
- 스키마 검증 점수 자동 산출
- CLI: `node marketplace/bin/agent-tracker.js stats <agent-id>`
- DB 위치: `~/.claude/agent-marketplace.db`
```

**Step 2: 전체 테스트 최종 확인**

```bash
cd marketplace && npx vitest run
```
Expected: All tests PASS

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add marketplace section to CLAUDE.md"
```

---

## 태스크 요약

| Task | 내용 | 파일 수 |
|------|------|---------|
| 1 | 프로젝트 초기화 | 2 |
| 2 | SQLite DB 모듈 | 2 |
| 3 | 스키마 검증 모듈 | 2 |
| 4 | 실행 기록 모듈 | 2 |
| 5 | Hook 스크립트 | 3 |
| 6 | Hook 등록 | 1 |
| 7 | CLI 도구 | 3 |
| 8 | 통합 테스트 | 1 |
| 9 | ESM/vitest 설정 | 2 |
| 10 | 문서화 | 1 |

**총 10개 태스크, ~19개 파일, ~10 커밋**

**의존성 순서:** Task 9 → Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 → Task 10

(실제로는 Task 9의 ESM 설정이 가장 먼저 필요하므로 Task 1과 통합하여 실행)
