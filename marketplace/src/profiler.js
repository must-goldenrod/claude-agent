import { getDb } from './db.js';

// Axis weights for composite score
const WEIGHTS = { quality: 0.35, efficiency: 0.25, reliability: 0.25, impact: 0.15 };

// Phase weights for impact calculation
const PHASE_WEIGHTS = {
  'idea-exploration': 0.7,
  'requirements': 0.75,
  'architecture': 0.8,
  'implementation': 0.9,
  'testing': 1.0,
};

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function clamp(v) {
  return Math.max(0, Math.min(1, v));
}

function calculateQuality(execIds, db) {
  if (!execIds.length) return { score: 0, details: {} };

  const placeholders = execIds.map(() => '?').join(',');

  // Check for LLM evaluations
  const llmEvals = db.prepare(
    `SELECT details FROM evaluations WHERE execution_id IN (${placeholders}) AND eval_type = 'llm'`
  ).all(...execIds);

  // Check for user evaluations
  const userEvals = db.prepare(
    `SELECT score FROM evaluations WHERE execution_id IN (${placeholders}) AND eval_type = 'user'`
  ).all(...execIds);

  // Fall back to schema scores
  const schemaEvals = db.prepare(
    `SELECT score FROM evaluations WHERE execution_id IN (${placeholders}) AND eval_type = 'schema'`
  ).all(...execIds);

  const details = {};

  if (llmEvals.length > 0) {
    const parsed = llmEvals.map(e => JSON.parse(e.details));
    details.relevance = round2(avg(parsed.map(p => p.relevance)));
    details.depth = round2(avg(parsed.map(p => p.depth)));
    details.actionability = round2(avg(parsed.map(p => p.actionability)));
    details.consistency = round2(avg(parsed.map(p => p.consistency)));

    let llmScore = avg([details.relevance, details.depth, details.actionability, details.consistency]);

    if (userEvals.length > 0) {
      const userAvg = avg(userEvals.map(e => e.score));
      details.userScore = round2(userAvg);
      llmScore = llmScore * 0.6 + userAvg * 0.4;
    }

    return { score: clamp(round2(llmScore)), details };
  }

  // Fallback: schema score average
  const schemaAvg = avg(schemaEvals.map(e => e.score));
  details.schemaOnly = true;
  details.schemaAvg = round2(schemaAvg);
  return { score: clamp(round2(schemaAvg)), details };
}

function calculateEfficiency(executions) {
  if (!executions.length) return { score: 0, details: {} };

  const durations = executions.map(e => e.duration_ms).filter(v => v != null);
  const tokens = executions.map(e => e.token_estimate).filter(v => v != null);

  let durationNorm = 0;
  if (durations.length > 1) {
    const maxD = Math.max(...durations);
    durationNorm = maxD > 0 ? 1 - (avg(durations) / maxD) : 0;
  } else if (durations.length === 1) {
    // Single execution: can't normalize, give neutral score
    durationNorm = 0.5;
  }

  let tokenNorm = 0;
  if (tokens.length > 1) {
    const maxT = Math.max(...tokens);
    tokenNorm = maxT > 0 ? 1 - (avg(tokens) / maxT) : 0;
  } else if (tokens.length === 1) {
    tokenNorm = 0.5;
  }

  // Retry rate: sessions with >1 call / total sessions
  const sessionCounts = {};
  for (const e of executions) {
    const sid = e.session_id || '_default';
    sessionCounts[sid] = (sessionCounts[sid] || 0) + 1;
  }
  const sessions = Object.values(sessionCounts);
  const retryRate = sessions.length > 0
    ? sessions.filter(c => c > 1).length / sessions.length
    : 0;

  const score = clamp(round2((durationNorm + tokenNorm + (1 - retryRate)) / 3));
  return {
    score,
    details: {
      durationNorm: round2(durationNorm),
      tokenNorm: round2(tokenNorm),
      retryRate: round2(retryRate),
    },
  };
}

function calculateReliability(executions) {
  if (!executions.length) return { score: 0, details: {} };

  const total = executions.length;
  const valid = executions.filter(e => e.output_schema_valid === 1).length;
  const schemaCompliance = valid / total;

  const failures = executions.filter(e => e.schema_score === 0).length;
  const failureRate = failures / total;

  // Stability: unique output hashes
  const hashes = new Set(executions.map(e => e.output_hash).filter(Boolean));
  const stability = total > 1
    ? 1 - (hashes.size - 1) / (total - 1)
    : 1;

  const score = clamp(round2(
    schemaCompliance * 0.4 + (1 - failureRate) * 0.3 + Math.max(0, stability) * 0.3
  ));

  return {
    score,
    details: {
      schemaCompliance: round2(schemaCompliance),
      failureRate: round2(failureRate),
      stability: round2(clamp(stability)),
    },
  };
}

function calculateImpact(executions, db) {
  if (!executions.length) return { score: 0, details: {} };

  // Usage frequency: executions per unique session
  const uniqueSessions = new Set(executions.map(e => e.session_id).filter(Boolean));
  const sessionCount = uniqueSessions.size || 1;
  const usageFreq = executions.length / sessionCount;

  // Global average for normalization
  const globalRow = db.prepare(`
    SELECT COUNT(*) as total, COUNT(DISTINCT session_id) as sessions
    FROM executions WHERE session_id IS NOT NULL
  `).get();
  const globalAvg = globalRow.sessions > 0 ? globalRow.total / globalRow.sessions : 1;
  const usageNorm = clamp(usageFreq / (globalAvg * 2)); // normalize: 2x global avg = 1.0

  // Phase weight average
  const phases = executions.map(e => e.pipeline_phase).filter(Boolean);
  const phaseScores = phases.map(p => PHASE_WEIGHTS[p] || 0.8);
  const avgPhaseWeight = phaseScores.length > 0 ? avg(phaseScores) : 0.8;

  const score = clamp(round2(usageNorm * 0.6 + avgPhaseWeight * 0.4));

  return {
    score,
    details: {
      usageFreq: round2(usageFreq),
      usageNorm: round2(usageNorm),
      avgPhaseWeight: round2(avgPhaseWeight),
    },
  };
}

export function calculateProfile(agentId) {
  const db = getDb();

  const executions = db.prepare(
    'SELECT * FROM executions WHERE agent_id = ? ORDER BY timestamp'
  ).all(agentId);

  if (!executions.length) {
    return {
      agentId,
      quality: 0, efficiency: 0, reliability: 0, impact: 0, composite: 0,
      sampleSize: 0,
      qualityDetails: {}, efficiencyDetails: {}, reliabilityDetails: {}, impactDetails: {},
    };
  }

  const execIds = executions.map(e => e.id);

  const quality = calculateQuality(execIds, db);
  const efficiency = calculateEfficiency(executions);
  const reliability = calculateReliability(executions);
  const impact = calculateImpact(executions, db);

  const composite = clamp(round2(
    quality.score * WEIGHTS.quality +
    efficiency.score * WEIGHTS.efficiency +
    reliability.score * WEIGHTS.reliability +
    impact.score * WEIGHTS.impact
  ));

  // Build environment context
  const projectTypes = [...new Set(executions.map(e => e.project_type).filter(Boolean))];
  const models = executions.map(e => e.model_version).filter(Boolean);
  const modelCounts = {};
  for (const m of models) modelCounts[m] = (modelCounts[m] || 0) + 1;
  const dominantModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

  return {
    agentId,
    quality: quality.score,
    efficiency: efficiency.score,
    reliability: reliability.score,
    impact: impact.score,
    composite,
    sampleSize: executions.length,
    context: {
      projectTypes,
      model: dominantModel,
      domain: detectDomain(agentId),
    },
    qualityDetails: quality.details,
    efficiencyDetails: efficiency.details,
    reliabilityDetails: reliability.details,
    impactDetails: impact.details,
  };
}

export function refreshProfile(agentId) {
  const db = getDb();
  const profile = calculateProfile(agentId);

  const executions = db.prepare(
    'SELECT MIN(timestamp) as start, MAX(timestamp) as end FROM executions WHERE agent_id = ?'
  ).get(agentId);

  const context = JSON.stringify({
    qualityDetails: profile.qualityDetails,
    efficiencyDetails: profile.efficiencyDetails,
    reliabilityDetails: profile.reliabilityDetails,
    impactDetails: profile.impactDetails,
  });

  db.prepare(`
    INSERT OR REPLACE INTO agent_profiles
    (agent_id, quality_score, efficiency_score, reliability_score, impact_score,
     composite_score, sample_size, period_start, period_end, context,
     quality_details, efficiency_details, reliability_details, impact_details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    agentId,
    profile.quality, profile.efficiency, profile.reliability, profile.impact,
    profile.composite, profile.sampleSize,
    executions?.start || null, executions?.end || null,
    context,
    JSON.stringify(profile.qualityDetails),
    JSON.stringify(profile.efficiencyDetails),
    JSON.stringify(profile.reliabilityDetails),
    JSON.stringify(profile.impactDetails),
  );

  // Record history snapshot
  db.prepare(`
    INSERT INTO profile_history
    (agent_id, quality_score, efficiency_score, reliability_score, impact_score,
     composite_score, sample_size, context)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    agentId,
    profile.quality, profile.efficiency, profile.reliability, profile.impact,
    profile.composite, profile.sampleSize, context,
  );

  return profile;
}

export function getProfile(agentId) {
  const db = getDb();
  return db.prepare('SELECT * FROM agent_profiles WHERE agent_id = ?').get(agentId) || null;
}

export function getProfileHistory(agentId, limit = 50) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM profile_history WHERE agent_id = ? ORDER BY snapshot_date DESC LIMIT ?'
  ).all(agentId, limit);
}

export function refreshAllProfiles() {
  const db = getDb();
  const agents = db.prepare('SELECT DISTINCT agent_id FROM executions').all();
  const results = [];
  for (const { agent_id } of agents) {
    results.push({ agentId: agent_id, profile: refreshProfile(agent_id) });
  }
  return results;
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
