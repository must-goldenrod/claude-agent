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
