# Phase 5A: 복합 평가 엔진 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 에이전트 성능을 품질/효율/신뢰/기여 4축으로 정량화하는 프로필 시스템 구축

**Architecture:** PreToolUse Hook 추가로 실행 시간 측정, DB 스키마 확장(executions 컬럼 + agent_profiles/profile_history 테이블), profiler.js 모듈이 4축 계산 후 캐시 테이블에 UPSERT, CLI에서 profile show/refresh/compare 명령어 제공

**Tech Stack:** Node.js (ESM), better-sqlite3, vitest, commander.js

---

### Task 1: DB 스키마 마이그레이션

**Files:**
- Modify: `marketplace/src/db.js:10-59`
- Test: `marketplace/tests/db-migration.test.js`

**Step 1: Write the failing test**

```js
// marketplace/tests/db-migration.test.js
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
```

**Step 2: Run test to verify it fails**

Run: `cd marketplace && npx vitest run tests/db-migration.test.js`
Expected: FAIL -- new columns and tables do not exist yet

**Step 3: Implement schema changes in db.js**

Modify `marketplace/src/db.js`. Replace the SCHEMA constant and update `createDb`:

```js
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
  output_length INTEGER,
  token_estimate INTEGER,
  call_order INTEGER,
  project_type TEXT,
  model_version TEXT,
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

CREATE TABLE IF NOT EXISTS agent_profiles (
  agent_id TEXT PRIMARY KEY,
  quality_score REAL,
  efficiency_score REAL,
  reliability_score REAL,
  impact_score REAL,
  composite_score REAL,
  sample_size INTEGER,
  period_start TEXT,
  period_end TEXT,
  context TEXT,
  calculated_at TEXT DEFAULT (datetime('now')),
  quality_details TEXT,
  efficiency_details TEXT,
  reliability_details TEXT,
  impact_details TEXT
);

CREATE TABLE IF NOT EXISTS profile_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  quality_score REAL,
  efficiency_score REAL,
  reliability_score REAL,
  impact_score REAL,
  composite_score REAL,
  sample_size INTEGER,
  snapshot_date TEXT DEFAULT (datetime('now')),
  context TEXT
);

CREATE INDEX IF NOT EXISTS idx_executions_agent ON executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_executions_timestamp ON executions(timestamp);
CREATE INDEX IF NOT EXISTS idx_evaluations_execution ON evaluations(execution_id);
CREATE INDEX IF NOT EXISTS idx_profile_history_agent ON profile_history(agent_id);
`;

export function createDb(dbPath = DEFAULT_DB_PATH) {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  // Migrate existing DBs: add columns that may not exist
  const cols = db.prepare("PRAGMA table_info(executions)").all().map(c => c.name);
  if (!cols.includes('output_length')) {
    db.exec('ALTER TABLE executions ADD COLUMN output_length INTEGER');
    db.exec('ALTER TABLE executions ADD COLUMN token_estimate INTEGER');
    db.exec('ALTER TABLE executions ADD COLUMN call_order INTEGER');
    db.exec('ALTER TABLE executions ADD COLUMN project_type TEXT');
    db.exec('ALTER TABLE executions ADD COLUMN model_version TEXT');
  }
  return db;
}
```

**Step 4: Run test to verify it passes**

Run: `cd marketplace && npx vitest run tests/db-migration.test.js`
Expected: PASS

**Step 5: Run all existing tests to ensure no regressions**

Run: `cd marketplace && npx vitest run`
Expected: All existing tests PASS

**Step 6: Commit**

```
git add marketplace/src/db.js marketplace/tests/db-migration.test.js
git commit -m "feat(marketplace): extend DB schema for 4-axis agent profiling"
```

---

### Task 2: PreToolUse Hook 작성

**Files:**
- Create: `marketplace/src/timing.js`
- Create: `.claude/hooks/pre-agent-timing.js`
- Modify: `.claude/settings.json`
- Test: `marketplace/tests/pre-timing.test.js`

**Step 1: Write the failing test**

```js
// marketplace/tests/pre-timing.test.js
import { describe, it, expect, afterEach } from 'vitest';
import { writeTimingStart, readTimingStart, cleanupTiming } from '../src/timing.js';

describe('Pre-agent timing', () => {
  const testPid = 'test-99999';

  afterEach(() => { cleanupTiming(testPid); });

  it('writes and reads timing start', () => {
    const now = Date.now();
    writeTimingStart(testPid, { startTime: now, callOrder: 1 });
    const data = readTimingStart(testPid);
    expect(data.startTime).toBe(now);
    expect(data.callOrder).toBe(1);
  });

  it('increments call order on subsequent writes', () => {
    writeTimingStart(testPid, { startTime: 1000, callOrder: 1 });
    writeTimingStart(testPid, { startTime: 2000, callOrder: 2 });
    const data = readTimingStart(testPid);
    expect(data.callOrder).toBe(2);
  });

  it('returns null when no timing file exists', () => {
    const data = readTimingStart('nonexistent-pid');
    expect(data).toBeNull();
  });

  it('cleanup removes the file', () => {
    writeTimingStart(testPid, { startTime: 1000, callOrder: 1 });
    cleanupTiming(testPid);
    expect(readTimingStart(testPid)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd marketplace && npx vitest run tests/pre-timing.test.js`
Expected: FAIL -- timing.js does not exist

**Step 3: Implement timing module**

```js
// marketplace/src/timing.js
import fs from 'fs';
import path from 'path';
import os from 'os';

function timingPath(pid) {
  return path.join(os.tmpdir(), `agent-timing-${pid}.json`);
}

export function writeTimingStart(pid, data) {
  fs.writeFileSync(timingPath(pid), JSON.stringify(data));
}

export function readTimingStart(pid) {
  const p = timingPath(pid);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function cleanupTiming(pid) {
  const p = timingPath(pid);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
```

**Step 4: Run test to verify it passes**

Run: `cd marketplace && npx vitest run tests/pre-timing.test.js`
Expected: PASS

**Step 5: Create the PreToolUse hook script**

```js
// .claude/hooks/pre-agent-timing.js
#!/usr/bin/env node

import { writeTimingStart, readTimingStart } from '../../marketplace/src/timing.js';

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

  if (input?.tool_name !== 'Agent') {
    process.exit(0);
  }

  const pid = process.ppid || process.pid;
  const existing = readTimingStart(pid);
  const callOrder = existing ? existing.callOrder + 1 : 1;

  writeTimingStart(pid, {
    startTime: Date.now(),
    callOrder,
  });
}

main();
```

**Step 6: Update settings.json**

Replace `.claude/settings.json` with:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": { "tool": "Agent" },
        "command": "node .claude/hooks/pre-agent-timing.js"
      }
    ],
    "PostToolUse": [
      {
        "matcher": { "tool": "Agent" },
        "command": "node .claude/hooks/track-agent-execution.js"
      }
    ]
  }
}
```

**Step 7: Commit**

```
git add marketplace/src/timing.js marketplace/tests/pre-timing.test.js .claude/hooks/pre-agent-timing.js .claude/settings.json
git commit -m "feat(hooks): add PreToolUse hook for agent execution timing"
```

---

### Task 3: PostToolUse Hook 확장 + hook-parser 확장

**Files:**
- Modify: `marketplace/src/hook-parser.js`
- Modify: `.claude/hooks/track-agent-execution.js`
- Modify: `marketplace/src/tracker.js:9-37`
- Modify: `marketplace/tests/hook.test.js`

**Step 1: Write the failing tests**

Append to `marketplace/tests/hook.test.js`:

```js
it('parseHookInput extracts output_length', () => {
  const input = {
    tool_name: 'Agent',
    tool_input: { subagent_type: 'test', prompt: 'do stuff' },
    tool_output: 'Hello world output',
  };
  const parsed = parseHookInput(input);
  expect(parsed.outputLength).toBe(18);
});

it('parseHookInput estimates tokens from output', () => {
  const output = 'a'.repeat(400); // 400 chars ~ 100 tokens
  const input = {
    tool_name: 'Agent',
    tool_input: { subagent_type: 'test' },
    tool_output: output,
  };
  const parsed = parseHookInput(input);
  expect(parsed.tokenEstimate).toBe(100);
});
```

**Step 2: Run test to verify it fails**

Run: `cd marketplace && npx vitest run tests/hook.test.js`
Expected: FAIL -- outputLength and tokenEstimate not in parsed result

**Step 3: Extend hook-parser.js**

Replace `marketplace/src/hook-parser.js`:

```js
import fs from 'fs';
import path from 'path';

export function shouldTrack(hookInput) {
  return hookInput?.tool_name === 'Agent';
}

export function parseHookInput(hookInput) {
  const toolInput = hookInput.tool_input || {};
  const output = hookInput.tool_output || '';
  return {
    agentId: toolInput.subagent_type || toolInput.name || 'unknown',
    model: toolInput.model,
    promptPreview: toolInput.prompt,
    description: toolInput.description,
    output,
    outputLength: output.length,
    tokenEstimate: Math.ceil(output.length / 4),
  };
}

export function detectProjectType(cwd = process.cwd()) {
  const checks = [
    { files: ['tsconfig.json'], type: 'typescript' },
    { files: ['Cargo.toml'], type: 'rust' },
    { files: ['go.mod'], type: 'go' },
    { files: ['pyproject.toml'], type: 'python' },
    { files: ['requirements.txt'], type: 'python' },
    { files: ['package.json'], type: 'javascript' },
  ];
  for (const { files, type } of checks) {
    if (files.some(f => fs.existsSync(path.join(cwd, f)))) return type;
  }
  return 'unknown';
}
```

**Step 4: Extend tracker.js recordExecution to accept new fields**

Modify `marketplace/src/tracker.js` function `recordExecution`:

```js
export function recordExecution({ agentId, model, sessionId, pipelinePhase, promptPreview, output, durationMs, outputLength, tokenEstimate, callOrder, projectType, modelVersion }) {
  const db = getDb();

  db.prepare(`
    INSERT OR IGNORE INTO agents (id, version, model) VALUES (?, '0.0.0', ?)
  `).run(agentId, model || 'unknown');

  const validation = validateAgentOutput(output || '');

  const result = db.prepare(`
    INSERT INTO executions (agent_id, session_id, pipeline_phase, prompt_hash, output_hash, output_schema_valid, schema_score, duration_ms, output_length, token_estimate, call_order, project_type, model_version, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    agentId,
    sessionId || null,
    pipelinePhase || null,
    hash(promptPreview),
    hash(output),
    validation.valid ? 1 : 0,
    validation.score,
    durationMs || null,
    outputLength || null,
    tokenEstimate || null,
    callOrder || null,
    projectType || null,
    modelVersion || null,
    JSON.stringify({
      prompt_preview: (promptPreview || '').slice(0, 200),
      validation_errors: validation.errors,
    })
  );

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
```

**Step 5: Update track-agent-execution.js**

Replace `.claude/hooks/track-agent-execution.js`:

```js
#!/usr/bin/env node

import { createDb } from '../../marketplace/src/db.js';
import { recordExecution } from '../../marketplace/src/tracker.js';
import { shouldTrack, parseHookInput, detectProjectType } from '../../marketplace/src/hook-parser.js';
import { readTimingStart } from '../../marketplace/src/timing.js';

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

    const pid = process.ppid || process.pid;
    const timing = readTimingStart(pid);
    const durationMs = timing ? Date.now() - timing.startTime : null;
    const callOrder = timing ? timing.callOrder : null;

    recordExecution({
      agentId: parsed.agentId,
      model: parsed.model,
      sessionId: process.env.CLAUDE_SESSION_ID || null,
      promptPreview: parsed.promptPreview,
      output: parsed.output,
      durationMs,
      outputLength: parsed.outputLength,
      tokenEstimate: parsed.tokenEstimate,
      callOrder,
      projectType: detectProjectType(),
      modelVersion: parsed.model || null,
    });
  } catch (err) {
    process.stderr.write(`[agent-tracker] ${err.message}\n`);
  }
}

main();
```

**Step 6: Run all tests**

Run: `cd marketplace && npx vitest run`
Expected: All PASS (existing tests work with new optional params defaulting to null)

**Step 7: Commit**

```
git add marketplace/src/hook-parser.js marketplace/src/tracker.js marketplace/tests/hook.test.js .claude/hooks/track-agent-execution.js
git commit -m "feat(hooks): extend PostToolUse hook with efficiency metrics collection"
```

---

### Task 4: Profiler 엔진 -- 4축 계산 로직

**Files:**
- Create: `marketplace/src/profiler.js`
- Test: `marketplace/tests/profiler.test.js`

**Step 1: Write the failing tests**

```js
// marketplace/tests/profiler.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import { recordExecution } from '../src/tracker.js';
import { recordLlmEvaluation, recordUserFeedback } from '../src/evaluator.js';
import { calculateProfile, refreshProfile, getProfile } from '../src/profiler.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(import.meta.dirname, 'test-profiler.db');

function seedAgent(agentId, count = 5, opts = {}) {
  for (let i = 0; i < count; i++) {
    recordExecution({
      agentId,
      model: opts.model || 'sonnet',
      sessionId: opts.sessionId || `sess-${i}`,
      pipelinePhase: opts.phase || 'implementation',
      promptPreview: `task ${i}`,
      output: JSON.stringify({
        agent: agentId, team: opts.team || 'security',
        phase: 'implementation', timestamp: new Date().toISOString(),
        findings: [{ title: 'f1', detail: 'd1' }],
        recommendations: [{ priority: 'high', action: 'fix' }],
        confidence_score: 0.8, concerns: [], sources: [],
      }),
      durationMs: 1000 + i * 500,
      outputLength: 200 + i * 50,
      tokenEstimate: 50 + i * 12,
      callOrder: i + 1,
      projectType: 'typescript',
      modelVersion: 'claude-sonnet-4-6',
    });
  }
}

describe('Profiler', () => {
  beforeEach(() => { createDb(TEST_DB); });
  afterEach(() => { closeDb(); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); });

  it('calculateProfile returns 4-axis scores', () => {
    seedAgent('sec-audit', 10);
    const profile = calculateProfile('sec-audit');
    expect(profile.quality).toBeGreaterThanOrEqual(0);
    expect(profile.quality).toBeLessThanOrEqual(1);
    expect(profile.efficiency).toBeGreaterThanOrEqual(0);
    expect(profile.reliability).toBeGreaterThanOrEqual(0);
    expect(profile.impact).toBeGreaterThanOrEqual(0);
    expect(profile.composite).toBeGreaterThanOrEqual(0);
    expect(profile.sampleSize).toBe(10);
  });

  it('quality score improves with LLM evaluations', () => {
    seedAgent('q-agent', 3);
    const db = getDb();
    const execs = db.prepare('SELECT id FROM executions WHERE agent_id = ?').all('q-agent');

    for (const e of execs) {
      recordLlmEvaluation(e.id, { relevance: 0.9, depth: 0.85, actionability: 0.88, consistency: 0.87 }, 'haiku');
    }

    const profile = calculateProfile('q-agent');
    expect(profile.quality).toBeGreaterThan(0.5);
    expect(profile.qualityDetails.relevance).toBeCloseTo(0.9, 1);
  });

  it('reliability reflects schema compliance rate', () => {
    seedAgent('rel-agent', 5);
    const profile = calculateProfile('rel-agent');
    expect(profile.reliability).toBeGreaterThan(0.8);
    expect(profile.reliabilityDetails.schemaCompliance).toBeGreaterThan(0.8);
  });

  it('refreshProfile saves to agent_profiles table', () => {
    seedAgent('refresh-agent', 5);
    refreshProfile('refresh-agent');
    const saved = getProfile('refresh-agent');
    expect(saved).not.toBeNull();
    expect(saved.composite_score).toBeGreaterThan(0);
  });

  it('refreshProfile records history snapshot', () => {
    seedAgent('hist-agent', 5);
    refreshProfile('hist-agent');
    const db = getDb();
    const history = db.prepare('SELECT * FROM profile_history WHERE agent_id = ?').all('hist-agent');
    expect(history.length).toBe(1);
  });

  it('returns zero profile for unknown agent', () => {
    const profile = calculateProfile('nonexistent');
    expect(profile.sampleSize).toBe(0);
    expect(profile.composite).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd marketplace && npx vitest run tests/profiler.test.js`
Expected: FAIL -- profiler.js does not exist

**Step 3: Implement profiler.js**

```js
// marketplace/src/profiler.js
import { getDb } from './db.js';

const WEIGHTS = { quality: 0.35, efficiency: 0.25, reliability: 0.25, impact: 0.15 };

export function calculateProfile(agentId, periodDays = 30) {
  const db = getDb();
  const cutoff = new Date(Date.now() - periodDays * 86400000).toISOString();

  const executions = db.prepare(
    'SELECT * FROM executions WHERE agent_id = ? AND timestamp >= ? ORDER BY timestamp DESC'
  ).all(agentId, cutoff);

  if (executions.length === 0) {
    return {
      quality: 0, efficiency: 0, reliability: 0, impact: 0, composite: 0,
      sampleSize: 0, context: {}, qualityDetails: {}, efficiencyDetails: {},
      reliabilityDetails: {}, impactDetails: {},
    };
  }

  const quality = calcQuality(db, executions);
  const efficiency = calcEfficiency(executions);
  const reliability = calcReliability(executions);
  const impact = calcImpact(db, executions);

  const composite = round(
    quality.score * WEIGHTS.quality +
    efficiency.score * WEIGHTS.efficiency +
    reliability.score * WEIGHTS.reliability +
    impact.score * WEIGHTS.impact
  );

  const projectTypes = executions.map(e => e.project_type).filter(Boolean);
  const models = executions.map(e => e.model_version).filter(Boolean);

  return {
    quality: quality.score,
    efficiency: efficiency.score,
    reliability: reliability.score,
    impact: impact.score,
    composite,
    sampleSize: executions.length,
    periodStart: executions[executions.length - 1].timestamp,
    periodEnd: executions[0].timestamp,
    context: {
      projectTypes: [...new Set(projectTypes)],
      model: mode(models) || 'unknown',
      domain: detectDomain(agentId),
    },
    qualityDetails: quality.details,
    efficiencyDetails: efficiency.details,
    reliabilityDetails: reliability.details,
    impactDetails: impact.details,
  };
}

function calcQuality(db, executions) {
  const execIds = executions.map(e => e.id);
  const placeholders = execIds.map(() => '?').join(',');

  const llmEvals = db.prepare(
    `SELECT details FROM evaluations WHERE execution_id IN (${placeholders}) AND eval_type = 'llm'`
  ).all(...execIds);

  const userEvals = db.prepare(
    `SELECT score FROM evaluations WHERE execution_id IN (${placeholders}) AND eval_type = 'user'`
  ).all(...execIds);

  if (llmEvals.length === 0 && userEvals.length === 0) {
    const avgSchema = avg(executions.map(e => e.schema_score).filter(v => v != null));
    return { score: round(avgSchema), details: { relevance: null, depth: null, actionability: null, consistency: null } };
  }

  let relevance = 0, depth = 0, actionability = 0, consistency = 0;
  for (const ev of llmEvals) {
    const d = JSON.parse(ev.details);
    relevance += d.relevance || 0;
    depth += d.depth || 0;
    actionability += d.actionability || 0;
    consistency += d.consistency || 0;
  }
  const n = llmEvals.length || 1;
  relevance = round(relevance / n);
  depth = round(depth / n);
  actionability = round(actionability / n);
  consistency = round(consistency / n);

  let llmScore = (relevance + depth + actionability + consistency) / 4;

  if (userEvals.length > 0) {
    const userAvg = avg(userEvals.map(e => e.score));
    llmScore = llmScore * 0.6 + userAvg * 0.4;
  }

  return {
    score: round(llmScore),
    details: { relevance, depth, actionability, consistency },
  };
}

function calcEfficiency(executions) {
  const durations = executions.map(e => e.duration_ms).filter(v => v != null);
  const tokens = executions.map(e => e.token_estimate).filter(v => v != null);

  if (durations.length === 0) return { score: 0, details: { avgDurationMs: 0, avgTokens: 0, retryRate: 0 } };

  const avgDuration = avg(durations);
  const avgTokens = avg(tokens);

  const maxDuration = Math.max(...durations, 1);
  const maxTokens = Math.max(...tokens, 1);
  const durationNorm = round(1 - avgDuration / maxDuration);
  const tokenNorm = round(1 - avgTokens / maxTokens);

  const sessionCounts = {};
  for (const e of executions) {
    if (e.session_id) sessionCounts[e.session_id] = (sessionCounts[e.session_id] || 0) + 1;
  }
  const sessions = Object.values(sessionCounts);
  const retryRate = sessions.length > 0
    ? sessions.filter(c => c > 1).length / sessions.length
    : 0;

  const score = round((durationNorm + tokenNorm + (1 - retryRate)) / 3);

  return {
    score: clamp(score),
    details: { avgDurationMs: Math.round(avgDuration), avgTokens: Math.round(avgTokens), retryRate: round(retryRate) },
  };
}

function calcReliability(executions) {
  const total = executions.length;
  const schemaValid = executions.filter(e => e.output_schema_valid === 1).length;
  const schemaCompliance = round(schemaValid / total);

  const failures = executions.filter(e => e.schema_score === 0).length;
  const failureRate = round(failures / total);

  const hashes = executions.map(e => e.output_hash).filter(Boolean);
  const uniqueHashes = new Set(hashes).size;
  const stability = hashes.length > 1
    ? round(1 - (uniqueHashes - 1) / (hashes.length - 1))
    : 1;

  const score = round(schemaCompliance * 0.4 + (1 - failureRate) * 0.3 + stability * 0.3);

  return {
    score: clamp(score),
    details: { schemaCompliance, failureRate, outputStability: stability },
  };
}

function calcImpact(db, executions) {
  const sessions = new Set(executions.map(e => e.session_id).filter(Boolean));
  const usageFreq = sessions.size > 0 ? executions.length / sessions.size : executions.length;

  const allAgentAvg = db.prepare(
    'SELECT AVG(cnt) as avg_count FROM (SELECT COUNT(*) as cnt FROM executions GROUP BY agent_id)'
  ).get();
  const globalAvg = allAgentAvg?.avg_count || 1;
  const usageNorm = round(Math.min(usageFreq / (globalAvg * 2), 1));

  const phaseWeights = {
    'idea-exploration': 0.7, 'requirements': 0.75,
    'architecture': 0.8, 'implementation': 0.9, 'testing': 1.0,
  };
  const phases = executions.map(e => e.pipeline_phase).filter(Boolean);
  const avgPhaseWeight = phases.length > 0
    ? avg(phases.map(p => phaseWeights[p] || 0.8))
    : 0.8;

  const score = round(usageNorm * 0.6 + avgPhaseWeight * 0.4);

  return {
    score: clamp(score),
    details: { usageFrequency: round(usageFreq), pipelineWeight: round(avgPhaseWeight) },
  };
}

export function refreshProfile(agentId, periodDays = 30) {
  const db = getDb();
  const profile = calculateProfile(agentId, periodDays);

  db.prepare(`
    INSERT OR REPLACE INTO agent_profiles
    (agent_id, quality_score, efficiency_score, reliability_score, impact_score, composite_score,
     sample_size, period_start, period_end, context, quality_details, efficiency_details,
     reliability_details, impact_details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    agentId, profile.quality, profile.efficiency, profile.reliability,
    profile.impact, profile.composite, profile.sampleSize,
    profile.periodStart || null, profile.periodEnd || null,
    JSON.stringify(profile.context),
    JSON.stringify(profile.qualityDetails),
    JSON.stringify(profile.efficiencyDetails),
    JSON.stringify(profile.reliabilityDetails),
    JSON.stringify(profile.impactDetails),
  );

  db.prepare(`
    INSERT INTO profile_history
    (agent_id, quality_score, efficiency_score, reliability_score, impact_score,
     composite_score, sample_size, context)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    agentId, profile.quality, profile.efficiency, profile.reliability,
    profile.impact, profile.composite, profile.sampleSize,
    JSON.stringify(profile.context),
  );

  return profile;
}

export function getProfile(agentId) {
  const db = getDb();
  return db.prepare('SELECT * FROM agent_profiles WHERE agent_id = ?').get(agentId) || null;
}

export function getProfileHistory(agentId, limit = 10) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM profile_history WHERE agent_id = ? ORDER BY snapshot_date DESC LIMIT ?'
  ).all(agentId, limit);
}

export function refreshAllProfiles(periodDays = 30) {
  const db = getDb();
  const agents = db.prepare('SELECT DISTINCT agent_id FROM executions').all();
  const results = [];
  for (const { agent_id } of agents) {
    results.push({ agentId: agent_id, profile: refreshProfile(agent_id, periodDays) });
  }
  return results;
}

function avg(arr) { return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function round(n) { return Math.round(n * 100) / 100; }
function clamp(n) { return Math.max(0, Math.min(1, n)); }
function mode(arr) {
  const counts = {};
  for (const v of arr) counts[v] = (counts[v] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
function detectDomain(agentId) {
  const domainMap = {
    security: ['security', 'audit', 'pentest', 'vulnerability', 'crypto', 'threat', 'incident', 'compliance', 'container', 'network', 'mobile', 'smart-contract', 'supply-chain', 'iac-security', 'secrets', 'dependency'],
    code: ['code', 'frontend', 'backend', 'refactor', 'architect'],
    research: ['research', 'web-researcher', 'market', 'tech-researcher', 'trend', 'competitor'],
    testing: ['test', 'unit-test', 'integration-test'],
    devops: ['devops', 'git', 'release', 'hotfix', 'pr-manager', 'ci-cd'],
    docs: ['docs', 'api-doc', 'guide'],
    infra: ['infra', 'containerizer', 'terraform'],
    quality: ['quality', 'fact-check', 'logic', 'bias', 'review'],
    debate: ['debate', 'optimist', 'pessimist', 'realist', 'innovator', 'conservative', 'devil', 'moderator'],
    synthesis: ['synthesis', 'integrator', 'strategist', 'report', 'execution', 'risk', 'metrics', 'change'],
    database: ['database', 'data-model', 'migration'],
  };
  for (const [domain, keywords] of Object.entries(domainMap)) {
    if (keywords.some(k => agentId.includes(k))) return domain;
  }
  return 'general';
}
```

**Step 4: Run tests**

Run: `cd marketplace && npx vitest run tests/profiler.test.js`
Expected: PASS

**Step 5: Run all tests**

Run: `cd marketplace && npx vitest run`
Expected: All PASS

**Step 6: Commit**

```
git add marketplace/src/profiler.js marketplace/tests/profiler.test.js
git commit -m "feat(marketplace): add 4-axis profiler engine (quality/efficiency/reliability/impact)"
```

---

### Task 5: CLI profile 명령어

**Files:**
- Create: `marketplace/src/cli-profile.js`
- Modify: `marketplace/bin/agent-tracker.js`
- Test: `marketplace/tests/cli-profile.test.js`

**Step 1: Write the failing test**

```js
// marketplace/tests/cli-profile.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import { recordExecution } from '../src/tracker.js';
import { formatProfile, formatTeamProfiles } from '../src/cli-profile.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(import.meta.dirname, 'test-cli-profile.db');

function seedAgent(agentId, count = 5) {
  for (let i = 0; i < count; i++) {
    recordExecution({
      agentId,
      model: 'sonnet',
      sessionId: `sess-${i}`,
      pipelinePhase: 'implementation',
      promptPreview: `task ${i}`,
      output: JSON.stringify({
        agent: agentId, team: 'security', phase: 'implementation',
        timestamp: new Date().toISOString(),
        findings: [{ title: 'f', detail: 'd' }],
        recommendations: [{ priority: 'high', action: 'fix' }],
        confidence_score: 0.8, concerns: [], sources: [],
      }),
      durationMs: 2000 + i * 100,
      outputLength: 300,
      tokenEstimate: 75,
      callOrder: i + 1,
      projectType: 'typescript',
      modelVersion: 'claude-sonnet-4-6',
    });
  }
}

describe('CLI Profile', () => {
  beforeEach(() => { createDb(TEST_DB); });
  afterEach(() => { closeDb(); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); });

  it('formatProfile outputs 4-axis display', () => {
    seedAgent('sec-audit', 10);
    const output = formatProfile('sec-audit');
    expect(output).toContain('sec-audit');
    expect(output).toContain('Quality');
    expect(output).toContain('Efficiency');
    expect(output).toContain('Reliability');
    expect(output).toContain('Impact');
    expect(output).toContain('Composite');
  });

  it('formatProfile returns message for unknown agent', () => {
    const output = formatProfile('nonexistent');
    expect(output).toContain('No execution data');
  });

  it('formatProfile supports JSON output', () => {
    seedAgent('json-agent', 3);
    const output = formatProfile('json-agent', { json: true });
    const parsed = JSON.parse(output);
    expect(parsed.quality).toBeDefined();
    expect(parsed.composite).toBeDefined();
  });

  it('formatTeamProfiles lists agents ranked by composite', () => {
    seedAgent('agent-a', 3);
    seedAgent('agent-b', 3);
    const output = formatTeamProfiles();
    expect(output).toContain('agent-a');
    expect(output).toContain('agent-b');
    expect(output).toContain('Quality');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd marketplace && npx vitest run tests/cli-profile.test.js`
Expected: FAIL -- cli-profile.js does not exist

**Step 3: Implement cli-profile.js**

```js
// marketplace/src/cli-profile.js
import { calculateProfile } from './profiler.js';
import { getDb } from './db.js';

function bar(score, width = 10) {
  const filled = Math.round(score * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

export function formatProfile(agentId, opts = {}) {
  const profile = calculateProfile(agentId, opts.period || 30);

  if (profile.sampleSize === 0) {
    return `No execution data found for ${agentId}`;
  }

  if (opts.json) return JSON.stringify(profile, null, 2);

  const lines = [
    `--- ${agentId} Performance Profile ---`,
    '',
    `  Quality     ${bar(profile.quality)} ${profile.quality.toFixed(2)}`,
    `  Efficiency  ${bar(profile.efficiency)} ${profile.efficiency.toFixed(2)}`,
    `  Reliability ${bar(profile.reliability)} ${profile.reliability.toFixed(2)}`,
    `  Impact      ${bar(profile.impact)} ${profile.impact.toFixed(2)}`,
    '  ────────────────────────',
    `  Composite   ${bar(profile.composite)} ${profile.composite.toFixed(2)}`,
    '',
  ];

  const ctx = profile.context || {};
  if (ctx.projectTypes?.length) lines.push(`  Projects: ${ctx.projectTypes.join(', ')}`);
  if (ctx.model) lines.push(`  Model: ${ctx.model}`);
  if (ctx.domain) lines.push(`  Domain: ${ctx.domain}`);
  lines.push(`  Samples: ${profile.sampleSize} executions`);

  return lines.join('\n');
}

export function formatProfileComparison(agentId, publisherProfile) {
  const local = calculateProfile(agentId);

  const lines = [
    `--- ${agentId} Performance Comparison ---`,
    '',
    '             Publisher    Local',
  ];

  const axes = [
    ['Quality', 'quality'], ['Efficiency', 'efficiency'],
    ['Reliability', 'reliability'], ['Impact', 'impact'],
    ['Composite', 'composite'],
  ];

  for (const [label, key] of axes) {
    const pub = publisherProfile[key]?.toFixed(2) ?? 'N/A';
    const loc = local.sampleSize > 0 ? local[key].toFixed(2) : 'N/A';
    lines.push(`  ${label.padEnd(12)} ${String(pub).padStart(8)}    ${String(loc).padStart(8)}`);
  }

  return lines.join('\n');
}

export function formatTeamProfiles(periodDays = 30) {
  const db = getDb();
  const agents = db.prepare('SELECT DISTINCT agent_id FROM executions').all();

  if (agents.length === 0) return 'No agents tracked yet.';

  const profiles = agents.map(({ agent_id }) => ({
    id: agent_id,
    ...calculateProfile(agent_id, periodDays),
  }));

  profiles.sort((a, b) => b.composite - a.composite);

  const header = '# | Agent | Quality | Efficiency | Reliability | Impact | Composite | Samples';
  const sep = '--|-------|---------|------------|-------------|--------|-----------|--------';
  const rows = profiles.map((p, i) =>
    `${i + 1} | ${p.id} | ${p.quality.toFixed(2)} | ${p.efficiency.toFixed(2)} | ${p.reliability.toFixed(2)} | ${p.impact.toFixed(2)} | ${p.composite.toFixed(2)} | ${p.sampleSize}`
  );

  return [header, sep, ...rows].join('\n');
}
```

**Step 4: Run test**

Run: `cd marketplace && npx vitest run tests/cli-profile.test.js`
Expected: PASS

**Step 5: Add profile commands to agent-tracker.js**

Add these imports at the top of `marketplace/bin/agent-tracker.js`:

```js
import { formatProfile, formatTeamProfiles } from '../src/cli-profile.js';
import { refreshProfile, refreshAllProfiles } from '../src/profiler.js';
```

Add before `program.parse()`:

```js
const profileCmd = program.command('profile').description('Agent performance profiles');

profileCmd
  .command('show <agent-id>')
  .description('Show 4-axis performance profile')
  .option('--json', 'Output as JSON')
  .option('-p, --period <days>', 'Evaluation period in days', '30')
  .action((agentId, opts) => {
    createDb();
    console.log(formatProfile(agentId, { json: opts.json, period: parseInt(opts.period) }));
  });

profileCmd
  .command('refresh [agent-id]')
  .description('Recalculate and cache profile')
  .option('-p, --period <days>', 'Evaluation period in days', '30')
  .action((agentId, opts) => {
    createDb();
    if (agentId) {
      const profile = refreshProfile(agentId, parseInt(opts.period));
      console.log(`Refreshed ${agentId}: composite ${profile.composite.toFixed(2)}`);
    } else {
      const results = refreshAllProfiles(parseInt(opts.period));
      console.log(`Refreshed ${results.length} agent profiles.`);
      for (const r of results) {
        console.log(`  ${r.agentId}: ${r.profile.composite.toFixed(2)}`);
      }
    }
  });

profileCmd
  .command('team')
  .description('Show all agent profiles ranked by composite score')
  .action(() => {
    createDb();
    console.log(formatTeamProfiles());
  });
```

**Step 6: Run all tests**

Run: `cd marketplace && npx vitest run`
Expected: All PASS

**Step 7: Commit**

```
git add marketplace/src/cli-profile.js marketplace/tests/cli-profile.test.js marketplace/bin/agent-tracker.js
git commit -m "feat(marketplace): add CLI profile commands (show/refresh/team)"
```

---

### Task 6: 통합 테스트

**Files:**
- Create: `marketplace/tests/profile-integration.test.js`

**Step 1: Write integration test**

```js
// marketplace/tests/profile-integration.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import { recordExecution } from '../src/tracker.js';
import { recordLlmEvaluation, recordUserFeedback, getCompositeScore } from '../src/evaluator.js';
import { calculateProfile, refreshProfile, getProfile, getProfileHistory } from '../src/profiler.js';
import { formatProfile } from '../src/cli-profile.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(import.meta.dirname, 'test-profile-integration.db');

describe('Profile Integration', () => {
  beforeEach(() => { createDb(TEST_DB); });
  afterEach(() => { closeDb(); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); });

  it('full pipeline: record -> evaluate -> profile -> display', () => {
    // 1. Record executions
    const execIds = [];
    for (let i = 0; i < 5; i++) {
      const id = recordExecution({
        agentId: 'pipeline-agent',
        model: 'sonnet',
        sessionId: `sess-${i}`,
        pipelinePhase: 'implementation',
        promptPreview: `Review module ${i}`,
        output: JSON.stringify({
          agent: 'pipeline-agent', team: 'code', phase: 'implementation',
          timestamp: new Date().toISOString(),
          findings: [{ title: `finding-${i}`, detail: 'details' }],
          recommendations: [{ priority: 'high', action: 'fix it' }],
          confidence_score: 0.85, concerns: [], sources: [],
        }),
        durationMs: 3000 + i * 200,
        outputLength: 400,
        tokenEstimate: 100,
        callOrder: i + 1,
        projectType: 'typescript',
        modelVersion: 'claude-sonnet-4-6',
      });
      execIds.push(id);
    }

    // 2. Add LLM evaluations
    for (const id of execIds) {
      recordLlmEvaluation(id, {
        relevance: 0.88, depth: 0.82, actionability: 0.9, consistency: 0.85,
      }, 'haiku');
    }

    // 3. Add user feedback
    recordUserFeedback(execIds[0], 0.9, 'Excellent analysis');
    recordUserFeedback(execIds[1], 0.75, 'Good but missed edge case');

    // 4. Calculate profile
    const profile = calculateProfile('pipeline-agent');
    expect(profile.sampleSize).toBe(5);
    expect(profile.quality).toBeGreaterThan(0.5);
    expect(profile.efficiency).toBeGreaterThanOrEqual(0);
    expect(profile.reliability).toBeGreaterThan(0.5);
    expect(profile.composite).toBeGreaterThan(0);
    expect(profile.context.projectTypes).toContain('typescript');

    // 5. Refresh and verify persistence
    refreshProfile('pipeline-agent');
    const saved = getProfile('pipeline-agent');
    expect(saved.composite_score).toBeCloseTo(profile.composite, 1);

    // 6. Verify history
    const history = getProfileHistory('pipeline-agent');
    expect(history.length).toBe(1);

    // 7. CLI output works
    const display = formatProfile('pipeline-agent');
    expect(display).toContain('pipeline-agent');
    expect(display).toContain('Quality');

    // 8. Old composite score still works (backward compat)
    const oldComposite = getCompositeScore(execIds[0]);
    expect(oldComposite.score).toBeGreaterThan(0);
  });
});
```

**Step 2: Run integration test**

Run: `cd marketplace && npx vitest run tests/profile-integration.test.js`
Expected: PASS

**Step 3: Run full test suite**

Run: `cd marketplace && npx vitest run`
Expected: All PASS -- no regressions

**Step 4: Commit**

```
git add marketplace/tests/profile-integration.test.js
git commit -m "test(marketplace): add profile integration test covering full pipeline"
```

---

### Task 7: CLAUDE.md 업데이트

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Append profile CLI docs**

In the "CLI 명령어" section of `CLAUDE.md`, append after the existing marketplace commands:

```markdown
- `node marketplace/bin/agent-tracker.js profile show <agent-id>` -- 4축 성능 프로필
- `node marketplace/bin/agent-tracker.js profile show <agent-id> --json` -- JSON 출력
- `node marketplace/bin/agent-tracker.js profile refresh [agent-id]` -- 프로필 재계산 (전체 또는 특정)
- `node marketplace/bin/agent-tracker.js profile team` -- 전체 에이전트 프로필 순위
```

**Step 2: Commit**

```
git add CLAUDE.md
git commit -m "docs: add profile CLI commands to CLAUDE.md"
```
