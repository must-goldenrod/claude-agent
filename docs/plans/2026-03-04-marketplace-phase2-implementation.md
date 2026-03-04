# Agent Marketplace Phase 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** LLM 기반 품질 평가, 사용자 피드백, 종합 스코어 계산을 추가하여 에이전트 성능 평가를 완성한다.

**Architecture:** evaluator.js 모듈이 evaluations 테이블에 LLM/사용자 평가를 기록. CLI에 eval 서브커맨드 추가. Anthropic SDK로 haiku 호출. 종합 스코어는 기존 schema + llm + user를 가중 평균.

**Tech Stack:** Node.js, @anthropic-ai/sdk (haiku), better-sqlite3, commander.js, vitest

---

### Task 1: Anthropic SDK 의존성 추가

**Files:**
- Modify: `marketplace/package.json`

**Step 1: SDK 설치**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent/marketplace
npm install @anthropic-ai/sdk
```

**Step 2: 설치 확인**

```bash
node -e "import('@anthropic-ai/sdk').then(m => console.log('OK'))"
```

**Step 3: Commit**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent
git add marketplace/package.json marketplace/package-lock.json
git commit -m "chore(marketplace): add @anthropic-ai/sdk dependency"
```

---

### Task 2: LLM 평가 모듈

**Files:**
- Test: `marketplace/tests/evaluator.test.js`
- Create: `marketplace/src/evaluator.js`

**Step 1: 테스트 작성**

Create `marketplace/tests/evaluator.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import { recordExecution } from '../src/tracker.js';
import {
  recordLlmEvaluation,
  recordUserFeedback,
  getCompositeScore,
  getEvaluationsForExecution,
  buildEvalPrompt,
} from '../src/evaluator.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(import.meta.dirname, 'test-evaluator.db');

const VALID_OUTPUT = JSON.stringify({
  agent: 'security-auditor',
  team: 'security',
  phase: 'implementation',
  timestamp: '2026-03-04T10:00:00Z',
  input_summary: 'Reviewed auth module',
  findings: [{ title: 'SQL Injection', detail: 'Found in login handler', evidence: 'auth.js:42' }],
  recommendations: [{ action: 'Use parameterized queries', priority: 'high', rationale: 'CWE-89' }],
  confidence_score: 0.9,
  concerns: [],
  sources: ['https://owasp.org'],
});

describe('Evaluator', () => {
  let execId;

  beforeEach(() => {
    createDb(TEST_DB);
    execId = recordExecution({
      agentId: 'security-auditor',
      model: 'sonnet',
      promptPreview: 'Audit auth code',
      output: VALID_OUTPUT,
      durationMs: 10000,
    });
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('buildEvalPrompt creates a proper evaluation prompt', () => {
    const prompt = buildEvalPrompt('Audit auth code', VALID_OUTPUT);
    expect(prompt).toContain('relevance');
    expect(prompt).toContain('depth');
    expect(prompt).toContain('actionability');
    expect(prompt).toContain('Audit auth code');
  });

  it('recordLlmEvaluation stores scores in evaluations table', () => {
    const scores = { relevance: 0.9, depth: 0.8, actionability: 0.85, consistency: 0.9 };
    recordLlmEvaluation(execId, scores, 'claude-haiku-4-5-20251001');

    const evals = getDb().prepare(
      "SELECT * FROM evaluations WHERE execution_id = ? AND eval_type = 'llm'"
    ).all(execId);
    expect(evals).toHaveLength(1);

    const avg = (0.9 + 0.8 + 0.85 + 0.9) / 4;
    expect(evals[0].score).toBeCloseTo(avg, 2);
    expect(evals[0].evaluator).toBe('claude-haiku-4-5-20251001');
  });

  it('recordUserFeedback stores user score and comment', () => {
    recordUserFeedback(execId, 0.8, 'Good analysis but missed XSS');

    const evals = getDb().prepare(
      "SELECT * FROM evaluations WHERE execution_id = ? AND eval_type = 'user'"
    ).all(execId);
    expect(evals).toHaveLength(1);
    expect(evals[0].score).toBe(0.8);

    const details = JSON.parse(evals[0].details);
    expect(details.comment).toBe('Good analysis but missed XSS');
  });

  it('getCompositeScore computes weighted average (schema + llm)', () => {
    // schema eval already recorded by recordExecution (score = 1.0)
    recordLlmEvaluation(execId, { relevance: 0.8, depth: 0.7, actionability: 0.9, consistency: 0.8 }, 'haiku');

    const composite = getCompositeScore(execId);
    // No user score: schema(0.3) + llm(0.7)
    const llmAvg = (0.8 + 0.7 + 0.9 + 0.8) / 4;
    const expected = 1.0 * 0.3 + llmAvg * 0.7;
    expect(composite.score).toBeCloseTo(expected, 2);
    expect(composite.hasUserFeedback).toBe(false);
  });

  it('getCompositeScore includes user feedback with adjusted weights', () => {
    recordLlmEvaluation(execId, { relevance: 0.8, depth: 0.7, actionability: 0.9, consistency: 0.8 }, 'haiku');
    recordUserFeedback(execId, 0.75, 'Decent');

    const composite = getCompositeScore(execId);
    // With user: schema(0.2) + llm(0.4) + user(0.4)
    const llmAvg = (0.8 + 0.7 + 0.9 + 0.8) / 4;
    const expected = 1.0 * 0.2 + llmAvg * 0.4 + 0.75 * 0.4;
    expect(composite.score).toBeCloseTo(expected, 2);
    expect(composite.hasUserFeedback).toBe(true);
  });

  it('getCompositeScore returns schema-only when no llm/user', () => {
    const composite = getCompositeScore(execId);
    expect(composite.score).toBe(1.0);
    expect(composite.breakdown.schema).toBe(1.0);
  });

  it('getEvaluationsForExecution returns all evals', () => {
    recordLlmEvaluation(execId, { relevance: 0.8, depth: 0.7, actionability: 0.9, consistency: 0.8 }, 'haiku');
    recordUserFeedback(execId, 0.75, 'OK');

    const evals = getEvaluationsForExecution(execId);
    expect(evals).toHaveLength(3); // schema + llm + user
  });
});
```

**Step 2: 테스트 실패 확인**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent/marketplace && npx vitest run tests/evaluator.test.js
```

**Step 3: 구현**

Create `marketplace/src/evaluator.js`:
```js
import { getDb } from './db.js';

export function buildEvalPrompt(promptPreview, output) {
  return `You are evaluating the quality of an AI agent's output.

## Agent Input (task given)
${(promptPreview || '').slice(0, 500)}

## Agent Output
${(output || '').slice(0, 3000)}

## Evaluation Criteria

Rate each criterion from 0.0 to 1.0:

1. **relevance**: Does the output address the given task appropriately?
2. **depth**: Is the analysis substantive and specific (not superficial)?
3. **actionability**: Are the recommendations concrete and implementable?
4. **consistency**: Is the output well-structured and internally consistent?

## Response Format

Respond with ONLY a JSON object, no other text:
{"relevance": 0.0, "depth": 0.0, "actionability": 0.0, "consistency": 0.0}`;
}

export function parseLlmScores(responseText) {
  const match = responseText.match(/\{[^}]+\}/);
  if (!match) throw new Error('No JSON found in LLM response');
  const scores = JSON.parse(match[0]);
  for (const key of ['relevance', 'depth', 'actionability', 'consistency']) {
    if (typeof scores[key] !== 'number' || scores[key] < 0 || scores[key] > 1) {
      throw new Error(`Invalid score for ${key}: ${scores[key]}`);
    }
  }
  return scores;
}

export function recordLlmEvaluation(executionId, scores, evaluatorModel) {
  const db = getDb();
  const avg = (scores.relevance + scores.depth + scores.actionability + scores.consistency) / 4;
  const rounded = Math.round(avg * 100) / 100;

  db.prepare(`
    INSERT INTO evaluations (execution_id, eval_type, score, details, evaluator)
    VALUES (?, 'llm', ?, ?, ?)
  `).run(
    executionId,
    rounded,
    JSON.stringify(scores),
    evaluatorModel,
  );

  return rounded;
}

export function recordUserFeedback(executionId, score, comment) {
  const db = getDb();
  db.prepare(`
    INSERT INTO evaluations (execution_id, eval_type, score, details, evaluator)
    VALUES (?, 'user', ?, ?, 'user')
  `).run(
    executionId,
    score,
    JSON.stringify({ comment: comment || '' }),
  );
}

export function getEvaluationsForExecution(executionId) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM evaluations WHERE execution_id = ? ORDER BY timestamp'
  ).all(executionId);
}

export function getCompositeScore(executionId) {
  const evals = getEvaluationsForExecution(executionId);

  const schema = evals.find(e => e.eval_type === 'schema');
  const llm = evals.find(e => e.eval_type === 'llm');
  const user = evals.find(e => e.eval_type === 'user');

  const breakdown = {
    schema: schema?.score ?? null,
    llm: llm?.score ?? null,
    user: user?.score ?? null,
  };

  let score;
  const hasUserFeedback = user != null;
  const hasLlm = llm != null;

  if (hasUserFeedback && hasLlm) {
    // schema(0.2) + llm(0.4) + user(0.4)
    score = (breakdown.schema || 0) * 0.2 + breakdown.llm * 0.4 + breakdown.user * 0.4;
  } else if (hasLlm) {
    // schema(0.3) + llm(0.7)
    score = (breakdown.schema || 0) * 0.3 + breakdown.llm * 0.7;
  } else {
    // schema only
    score = breakdown.schema || 0;
  }

  return {
    score: Math.round(score * 100) / 100,
    breakdown,
    hasUserFeedback,
    hasLlm,
  };
}
```

**Step 4: 테스트 통과 확인**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent/marketplace && npx vitest run tests/evaluator.test.js
```
Expected: 7 tests PASS

**Step 5: 전체 테스트 확인**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent/marketplace && npx vitest run
```
Expected: 30 tests PASS (기존 23 + 신규 7)

**Step 6: Commit**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent
git add marketplace/src/evaluator.js marketplace/tests/evaluator.test.js
git commit -m "feat(marketplace): add evaluator module with LLM scoring and user feedback"
```

---

### Task 3: LLM 평가 실행 함수 (Anthropic API 호출)

**Files:**
- Test: `marketplace/tests/llm-eval.test.js`
- Create: `marketplace/src/llm-eval.js`

**Step 1: 테스트 작성 (API는 mock)**

Create `marketplace/tests/llm-eval.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { parseLlmScores } from '../src/evaluator.js';

describe('LLM Eval', () => {
  it('parseLlmScores extracts valid JSON from response', () => {
    const response = 'Here is my evaluation:\n{"relevance": 0.9, "depth": 0.8, "actionability": 0.85, "consistency": 0.9}';
    const scores = parseLlmScores(response);
    expect(scores.relevance).toBe(0.9);
    expect(scores.depth).toBe(0.8);
  });

  it('parseLlmScores throws on invalid response', () => {
    expect(() => parseLlmScores('no json here')).toThrow('No JSON found');
  });

  it('parseLlmScores throws on out-of-range scores', () => {
    const response = '{"relevance": 1.5, "depth": 0.8, "actionability": 0.85, "consistency": 0.9}';
    expect(() => parseLlmScores(response)).toThrow('Invalid score');
  });

  it('parseLlmScores throws on missing keys', () => {
    const response = '{"relevance": 0.9, "depth": 0.8}';
    expect(() => parseLlmScores(response)).toThrow('Invalid score');
  });
});
```

Create `marketplace/src/llm-eval.js`:
```js
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from './db.js';
import { buildEvalPrompt, parseLlmScores, recordLlmEvaluation } from './evaluator.js';

const MODEL = 'claude-haiku-4-5-20251001';

export async function evaluateExecution(executionId) {
  const db = getDb();
  const exec = db.prepare('SELECT * FROM executions WHERE id = ?').get(executionId);
  if (!exec) throw new Error(`Execution ${executionId} not found`);

  const metadata = JSON.parse(exec.metadata || '{}');
  const prompt = buildEvalPrompt(metadata.prompt_preview, exec.metadata);

  // Get full output from metadata or use what we have
  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text;
  const scores = parseLlmScores(text);
  const avgScore = recordLlmEvaluation(executionId, scores, MODEL);

  return { scores, avgScore, model: MODEL };
}

export async function evaluateAgentBatch(agentId, limit = 10) {
  const db = getDb();
  const executions = db.prepare(`
    SELECT e.id FROM executions e
    LEFT JOIN evaluations ev ON e.id = ev.execution_id AND ev.eval_type = 'llm'
    WHERE e.agent_id = ? AND ev.id IS NULL
    ORDER BY e.timestamp DESC
    LIMIT ?
  `).all(agentId, limit);

  const results = [];
  for (const exec of executions) {
    try {
      const result = await evaluateExecution(exec.id);
      results.push({ executionId: exec.id, ...result });
    } catch (err) {
      results.push({ executionId: exec.id, error: err.message });
    }
  }
  return results;
}
```

**Step 2: 테스트 실행**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent/marketplace && npx vitest run tests/llm-eval.test.js
```
Expected: 4 tests PASS (these only test parseLlmScores, no API calls)

**Step 3: Commit**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent
git add marketplace/src/llm-eval.js marketplace/tests/llm-eval.test.js
git commit -m "feat(marketplace): add LLM evaluation runner with Anthropic API"
```

---

### Task 4: CLI eval 서브커맨드

**Files:**
- Test: `marketplace/tests/cli-eval.test.js`
- Modify: `marketplace/src/cli.js`
- Modify: `marketplace/bin/agent-tracker.js`

**Step 1: 테스트 작성**

Create `marketplace/tests/cli-eval.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, getDb, closeDb } from '../src/db.js';
import { recordExecution } from '../src/tracker.js';
import { recordLlmEvaluation, recordUserFeedback } from '../src/evaluator.js';
import { formatEvalReport, formatCompositeScore } from '../src/cli.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(import.meta.dirname, 'test-cli-eval.db');

const VALID_OUTPUT = JSON.stringify({
  agent: 'test-agent', team: 'security', phase: 'implementation',
  timestamp: '2026-03-04T10:00:00Z', input_summary: 'test',
  findings: [{ title: 'Bug', detail: 'Found it', evidence: 'line 1' }],
  recommendations: [{ action: 'Fix it', priority: 'high', rationale: 'Because' }],
  confidence_score: 0.9, concerns: [], sources: [],
});

describe('CLI Eval Formatters', () => {
  let execId;

  beforeEach(() => {
    createDb(TEST_DB);
    execId = recordExecution({
      agentId: 'test-agent',
      output: VALID_OUTPUT,
      durationMs: 5000,
    });
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('formatCompositeScore shows schema-only score', () => {
    const output = formatCompositeScore(execId);
    expect(output).toContain('Schema');
    expect(output).toContain('1.0');
  });

  it('formatCompositeScore shows all three scores', () => {
    recordLlmEvaluation(execId, { relevance: 0.8, depth: 0.7, actionability: 0.9, consistency: 0.8 }, 'haiku');
    recordUserFeedback(execId, 0.75, 'OK');

    const output = formatCompositeScore(execId);
    expect(output).toContain('Schema');
    expect(output).toContain('LLM');
    expect(output).toContain('User');
    expect(output).toContain('Composite');
  });

  it('formatEvalReport shows agent summary with eval data', () => {
    recordLlmEvaluation(execId, { relevance: 0.8, depth: 0.7, actionability: 0.9, consistency: 0.8 }, 'haiku');

    const output = formatEvalReport('test-agent');
    expect(output).toContain('test-agent');
    expect(output).toContain('Avg Composite');
  });
});
```

**Step 2: CLI 포매터 추가**

Add to `marketplace/src/cli.js` (append these functions):
```js
import { getCompositeScore, getEvaluationsForExecution } from './evaluator.js';

export function formatCompositeScore(executionId) {
  const composite = getCompositeScore(executionId);
  const lines = [`Execution #${executionId} Evaluation:`];

  if (composite.breakdown.schema !== null) {
    lines.push(`  Schema: ${composite.breakdown.schema.toFixed(2)}`);
  }
  if (composite.breakdown.llm !== null) {
    lines.push(`  LLM: ${composite.breakdown.llm.toFixed(2)}`);
    const evals = getEvaluationsForExecution(executionId);
    const llmEval = evals.find(e => e.eval_type === 'llm');
    if (llmEval) {
      const details = JSON.parse(llmEval.details);
      lines.push(`    relevance: ${details.relevance}, depth: ${details.depth}, actionability: ${details.actionability}, consistency: ${details.consistency}`);
    }
  }
  if (composite.breakdown.user !== null) {
    lines.push(`  User: ${composite.breakdown.user.toFixed(2)}`);
    const evals = getEvaluationsForExecution(executionId);
    const userEval = evals.find(e => e.eval_type === 'user');
    if (userEval) {
      const details = JSON.parse(userEval.details);
      if (details.comment) lines.push(`    Comment: ${details.comment}`);
    }
  }

  const weights = composite.hasUserFeedback
    ? 'schema(0.2) + llm(0.4) + user(0.4)'
    : composite.hasLlm
      ? 'schema(0.3) + llm(0.7)'
      : 'schema only';
  lines.push(`  Composite: ${composite.score.toFixed(2)} [${weights}]`);

  return lines.join('\n');
}

export function formatEvalReport(agentId) {
  const db = getDb();
  const executions = db.prepare(`
    SELECT e.id, e.schema_score, e.timestamp, e.duration_ms
    FROM executions e
    WHERE e.agent_id = ?
    ORDER BY e.timestamp DESC
    LIMIT 20
  `).all(agentId);

  if (executions.length === 0) return `No executions found for ${agentId}`;

  let totalComposite = 0;
  const rows = [];
  for (const exec of executions) {
    const composite = getCompositeScore(exec.id);
    totalComposite += composite.score;
    const flags = [
      composite.breakdown.schema !== null ? 'S' : '-',
      composite.breakdown.llm !== null ? 'L' : '-',
      composite.breakdown.user !== null ? 'U' : '-',
    ].join('');
    rows.push(`${exec.id} | ${composite.score.toFixed(2)} | ${flags} | ${exec.duration_ms ?? '?'}ms | ${exec.timestamp}`);
  }

  const avgComposite = (totalComposite / executions.length).toFixed(2);
  const header = `Agent: ${agentId} | Avg Composite: ${avgComposite} | Executions: ${executions.length}`;
  const tableHeader = 'ID | Score | Evals | Duration | Timestamp';
  const separator = '---|-------|-------|----------|----------';

  return [header, '', tableHeader, separator, ...rows].join('\n');
}
```

**Step 3: CLI 명령어 추가**

Add to `marketplace/bin/agent-tracker.js` — add new `eval` command group:

Add import at top:
```js
import { recordUserFeedback } from '../src/evaluator.js';
import { evaluateAgentBatch } from '../src/llm-eval.js';
import { formatCompositeScore, formatEvalReport } from '../src/cli.js';
```

Add commands before `program.parse()`:
```js
const evalCmd = program.command('eval').description('Evaluate agent quality');

evalCmd
  .command('llm <agent-id>')
  .description('Run LLM evaluation on recent executions')
  .option('-n, --last <number>', 'Number of executions to evaluate', '5')
  .action(async (agentId, opts) => {
    createDb();
    console.log(`Evaluating ${agentId} (last ${opts.last} unevaluated)...`);
    const results = await evaluateAgentBatch(agentId, parseInt(opts.last));
    for (const r of results) {
      if (r.error) {
        console.log(`  #${r.executionId}: ERROR - ${r.error}`);
      } else {
        console.log(`  #${r.executionId}: ${r.avgScore.toFixed(2)} (${r.model})`);
      }
    }
    console.log(`\n${formatEvalReport(agentId)}`);
  });

evalCmd
  .command('rate <execution-id>')
  .description('Rate an execution manually')
  .requiredOption('-s, --score <number>', 'Score 0.0-1.0')
  .option('-c, --comment <text>', 'Optional comment')
  .action((executionId, opts) => {
    createDb();
    const score = parseFloat(opts.score);
    if (score < 0 || score > 1) {
      console.error('Score must be between 0.0 and 1.0');
      process.exit(1);
    }
    recordUserFeedback(parseInt(executionId), score, opts.comment || '');
    console.log(`Recorded user feedback: ${score}`);
    console.log(formatCompositeScore(parseInt(executionId)));
  });

evalCmd
  .command('report <agent-id>')
  .description('Show evaluation report for an agent')
  .action((agentId) => {
    createDb();
    console.log(formatEvalReport(agentId));
  });

evalCmd
  .command('score <execution-id>')
  .description('Show composite score for an execution')
  .action((executionId) => {
    createDb();
    console.log(formatCompositeScore(parseInt(executionId)));
  });
```

**Step 4: 테스트 실행**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent/marketplace && npx vitest run
```
Expected: 37+ tests PASS (기존 30 + 신규 cli-eval 3 + llm-eval 4)

**Step 5: Commit**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent
git add marketplace/src/cli.js marketplace/bin/agent-tracker.js marketplace/tests/cli-eval.test.js
git commit -m "feat(marketplace): add eval CLI commands (llm, rate, report, score)"
```

---

### Task 5: formatStats에 종합 스코어 통합

**Files:**
- Modify: `marketplace/src/cli.js` — formatStats 함수 업데이트
- Modify: `marketplace/tests/cli.test.js` — 기존 테스트 업데이트

**Step 1: formatStats 업데이트**

`marketplace/src/cli.js`의 `formatStats` 함수를 수정하여 종합 스코어 포함:

```js
export function formatStats(agentId) {
  const stats = getAgentStats(agentId);

  // Calculate average composite score across recent executions
  const db = getDb();
  const recentExecs = db.prepare(
    'SELECT id FROM executions WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 20'
  ).all(agentId);

  let avgComposite = null;
  if (recentExecs.length > 0) {
    let total = 0;
    for (const exec of recentExecs) {
      const composite = getCompositeScore(exec.id);
      total += composite.score;
    }
    avgComposite = Math.round((total / recentExecs.length) * 100) / 100;
  }

  const lines = [
    `Agent: ${agentId}`,
    `Total Executions: ${stats.totalExecutions}`,
    `Avg Duration: ${stats.avgDurationMs}ms`,
    `Avg Schema Score: ${stats.avgSchemaScore}`,
    `Avg Composite Score: ${avgComposite ?? 'N/A'}`,
    `First Seen: ${stats.firstSeen || 'never'}`,
    `Last Seen: ${stats.lastSeen || 'never'}`,
  ];
  return lines.join('\n');
}
```

**Step 2: 테스트 업데이트**

Update `marketplace/tests/cli.test.js` — the 'formatStats returns readable string' test should now also check for 'Composite':

In the existing test that checks `formatStats`, add:
```js
expect(output).toContain('Composite');
```

**Step 3: 전체 테스트 실행**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent/marketplace && npx vitest run
```

**Step 4: Commit**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent
git add marketplace/src/cli.js marketplace/tests/cli.test.js
git commit -m "feat(marketplace): integrate composite score into stats display"
```

---

### Task 6: Phase 2 통합 테스트

**Files:**
- Modify: `marketplace/tests/integration.test.js`

**Step 1: 통합 테스트에 평가 파이프라인 추가**

Add new test to `marketplace/tests/integration.test.js`:
```js
import { recordLlmEvaluation, recordUserFeedback, getCompositeScore } from '../src/evaluator.js';
import { formatCompositeScore, formatEvalReport } from '../src/cli.js';

// Add inside the existing describe block:

it('full evaluation pipeline: schema + llm + user -> composite', () => {
  const execId = recordExecution({
    agentId: 'eval-test-agent',
    model: 'sonnet',
    output: JSON.stringify({
      agent: 'eval-test-agent', team: 'security', phase: 'implementation',
      timestamp: '2026-03-04T10:00:00Z', input_summary: 'test',
      findings: [{ title: 'Bug', detail: 'Found', evidence: 'line 1' }],
      recommendations: [{ action: 'Fix', priority: 'high', rationale: 'why' }],
      confidence_score: 0.9, concerns: [], sources: [],
    }),
    durationMs: 8000,
  });

  // Schema eval is auto-recorded (score = 1.0)
  const preComposite = getCompositeScore(execId);
  expect(preComposite.score).toBe(1.0);
  expect(preComposite.hasLlm).toBe(false);

  // Add LLM evaluation
  recordLlmEvaluation(execId, {
    relevance: 0.85, depth: 0.75, actionability: 0.9, consistency: 0.8
  }, 'claude-haiku-4-5-20251001');

  const midComposite = getCompositeScore(execId);
  expect(midComposite.hasLlm).toBe(true);
  expect(midComposite.hasUserFeedback).toBe(false);
  // schema(0.3) + llm(0.7)
  const llmAvg = (0.85 + 0.75 + 0.9 + 0.8) / 4;
  expect(midComposite.score).toBeCloseTo(1.0 * 0.3 + llmAvg * 0.7, 2);

  // Add user feedback
  recordUserFeedback(execId, 0.8, 'Good but could be deeper');

  const finalComposite = getCompositeScore(execId);
  expect(finalComposite.hasUserFeedback).toBe(true);
  // schema(0.2) + llm(0.4) + user(0.4)
  expect(finalComposite.score).toBeCloseTo(1.0 * 0.2 + llmAvg * 0.4 + 0.8 * 0.4, 2);

  // CLI can display
  const scoreDisplay = formatCompositeScore(execId);
  expect(scoreDisplay).toContain('Schema');
  expect(scoreDisplay).toContain('LLM');
  expect(scoreDisplay).toContain('User');

  const report = formatEvalReport('eval-test-agent');
  expect(report).toContain('eval-test-agent');
  expect(report).toContain('Avg Composite');
});
```

**Step 2: 전체 테스트 실행**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent/marketplace && npx vitest run
```

**Step 3: Commit**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent
git add marketplace/tests/integration.test.js
git commit -m "test(marketplace): add Phase 2 evaluation pipeline integration test"
```

---

### Task 7: 문서 업데이트

**Files:**
- Modify: `CLAUDE.md`

**Step 1: CLAUDE.md marketplace 섹션 업데이트**

Update the Agent Marketplace section to include Phase 2 commands:
```markdown
## Agent Marketplace

`marketplace/` 디렉토리에 에이전트 성능 추적 및 평가 시스템.

- PostToolUse Hook이 Agent 도구 호출을 자동 캡처 → SQLite에 저장
- 3단계 품질 평가: 스키마 검증 (자동) + LLM 평가 (haiku) + 사용자 피드백
- 종합 스코어: schema(0.2) + llm(0.4) + user(0.4) 가중 평균
- DB 위치: `~/.claude/agent-marketplace.db`

CLI 명령어:
- `node marketplace/bin/agent-tracker.js agents` — 전체 에이전트 목록
- `node marketplace/bin/agent-tracker.js stats <agent-id>` — 에이전트 통계
- `node marketplace/bin/agent-tracker.js list <agent-id>` — 실행 기록
- `node marketplace/bin/agent-tracker.js eval llm <agent-id>` — LLM 평가 실행
- `node marketplace/bin/agent-tracker.js eval rate <exec-id> -s 0.8` — 사용자 피드백
- `node marketplace/bin/agent-tracker.js eval report <agent-id>` — 평가 리포트
- `node marketplace/bin/agent-tracker.js eval score <exec-id>` — 종합 스코어
```

**Step 2: Commit**

```bash
cd /Users/mufin/Documents/claude-management/claude-agent
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Phase 2 evaluation commands"
```

---

## 태스크 요약

| Task | 내용 | 파일 수 |
|------|------|---------|
| 1 | Anthropic SDK 의존성 | 1 |
| 2 | 평가 모듈 (evaluator.js) | 2 |
| 3 | LLM 평가 실행 (llm-eval.js) | 2 |
| 4 | CLI eval 서브커맨드 | 3 |
| 5 | formatStats 종합 스코어 통합 | 2 |
| 6 | Phase 2 통합 테스트 | 1 |
| 7 | 문서 업데이트 | 1 |

**총 7개 태스크, ~12개 파일, ~7 커밋**

**의존성:** Task 1 → Task 2 → Task 3 (독립: Task 4, Task 5) → Task 6 → Task 7
