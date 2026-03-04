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
  `).run(executionId, rounded, JSON.stringify(scores), evaluatorModel);

  return rounded;
}

export function recordUserFeedback(executionId, score, comment) {
  const db = getDb();
  db.prepare(`
    INSERT INTO evaluations (execution_id, eval_type, score, details, evaluator)
    VALUES (?, 'user', ?, ?, 'user')
  `).run(executionId, score, JSON.stringify({ comment: comment || '' }));
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
    score = (breakdown.schema || 0) * 0.2 + breakdown.llm * 0.4 + breakdown.user * 0.4;
  } else if (hasLlm) {
    score = (breakdown.schema || 0) * 0.3 + breakdown.llm * 0.7;
  } else {
    score = breakdown.schema || 0;
  }

  return {
    score: Math.round(score * 100) / 100,
    breakdown,
    hasUserFeedback,
    hasLlm,
  };
}
