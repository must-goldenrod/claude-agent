import Anthropic from '@anthropic-ai/sdk';
import { getDb } from './db.js';
import { buildEvalPrompt, parseLlmScores, recordLlmEvaluation } from './evaluator.js';

const MODEL = process.env.AGENT_EVAL_MODEL || 'claude-haiku-4-5-20251001';

export async function evaluateExecution(executionId) {
  const db = getDb();
  const exec = db.prepare('SELECT * FROM executions WHERE id = ?').get(executionId);
  if (!exec) throw new Error(`Execution ${executionId} not found`);

  const metadata = JSON.parse(exec.metadata || '{}');
  const prompt = buildEvalPrompt(metadata.prompt_preview || '', metadata.output_preview || '');

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
