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
