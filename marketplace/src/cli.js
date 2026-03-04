import { getAgentStats, getExecutions } from './tracker.js';
import { getDb } from './db.js';
import { getCompositeScore, getEvaluationsForExecution } from './evaluator.js';

export function formatStats(agentId) {
  const stats = getAgentStats(agentId);
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
    FROM executions e WHERE e.agent_id = ?
    ORDER BY e.timestamp DESC LIMIT 20
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
