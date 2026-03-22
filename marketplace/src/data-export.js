import { getDb } from './db.js';
import { loadRegistry } from './registry.js';
import { calculateProfile } from './profiler.js';
import { safePath } from './sanitize.js';
import fs from 'fs';
import path from 'path';

export function exportSummary(registry) {
  const db = getDb();
  const agents = Object.values(registry.agents);
  const totalExecs = db.prepare('SELECT COUNT(*) as count FROM executions').get().count;
  const avgScore = db.prepare('SELECT AVG(composite_score) as avg FROM agent_profiles').get().avg;

  const teams = new Set();
  for (const a of agents) {
    if (a.tags) a.tags.forEach(t => teams.add(t));
  }

  return {
    total_agents: agents.length,
    total_executions: totalExecs,
    avg_score: avgScore ? Math.round(avgScore * 100) / 100 : 0,
    team_count: teams.size,
    generated_at: new Date().toISOString(),
  };
}

export function exportAgentsList(registry) {
  const db = getDb();
  const agents = Object.values(registry.agents);

  return agents.map(a => {
    const profile = db.prepare('SELECT * FROM agent_profiles WHERE agent_id = ?').get(a.name);

    return {
      name: a.name,
      description: a.description || '',
      version: a.latest,
      tags: a.tags || [],
      model: a.model_recommendation || 'sonnet',
      performance: a.performance || null,
      composite: profile?.composite_score ?? a.performance?.composite ?? null,
      total_executions: profile?.sample_size ?? a.performance?.sample_size ?? 0,
    };
  }).sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0));
}

export function exportAgentDetail(agentId) {
  const db = getDb();

  const profile = calculateProfile(agentId);

  const executions = db.prepare(
    'SELECT id, timestamp, duration_ms, schema_score, output_length, token_estimate, project_type, model_version FROM executions WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 100'
  ).all(agentId);

  const evaluations = db.prepare(`
    SELECT e.execution_id, e.eval_type, e.score, e.details, e.evaluator, e.timestamp
    FROM evaluations e
    JOIN executions ex ON e.execution_id = ex.id
    WHERE ex.agent_id = ?
    ORDER BY e.timestamp DESC LIMIT 100
  `).all(agentId);

  const history = db.prepare(
    'SELECT * FROM profile_history WHERE agent_id = ? ORDER BY snapshot_date DESC LIMIT 30'
  ).all(agentId);

  return {
    agentId,
    profile: {
      quality: profile.quality,
      efficiency: profile.efficiency,
      reliability: profile.reliability,
      impact: profile.impact,
      composite: profile.composite,
      sampleSize: profile.sampleSize,
      context: profile.context,
      qualityDetails: profile.qualityDetails,
      efficiencyDetails: profile.efficiencyDetails,
      reliabilityDetails: profile.reliabilityDetails,
      impactDetails: profile.impactDetails,
    },
    executions,
    evaluations,
    history: history.map(h => ({
      date: h.snapshot_date,
      quality: h.quality_score,
      efficiency: h.efficiency_score,
      reliability: h.reliability_score,
      impact: h.impact_score,
      composite: h.composite_score,
    })),
  };
}

export function exportTeams(registry) {
  const agents = Object.values(registry.agents);

  const teamMap = {};
  for (const a of agents) {
    const team = (a.tags && a.tags[0]) || 'general';
    if (!teamMap[team]) teamMap[team] = [];
    teamMap[team].push(a);
  }

  return Object.entries(teamMap).map(([team, members]) => {
    const scores = members
      .map(m => m.performance?.composite)
      .filter(s => s != null);
    const avgScore = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : 0;
    const totalExecs = members.reduce((sum, m) => sum + (m.performance?.sample_size || 0), 0);

    return {
      name: team,
      agent_count: members.length,
      avg_score: avgScore,
      total_executions: totalExecs,
      agents: members.map(m => m.name),
    };
  }).sort((a, b) => b.avg_score - a.avg_score);
}

export function exportLeaderboard(registry) {
  const agents = Object.values(registry.agents)
    .filter(a => a.performance?.composite != null)
    .sort((a, b) => b.performance.composite - a.performance.composite)
    .map((a, i) => ({
      rank: i + 1,
      name: a.name,
      composite: a.performance.composite,
      quality: a.performance.quality,
      efficiency: a.performance.efficiency,
      reliability: a.performance.reliability,
      impact: a.performance.impact,
      sample_size: a.performance.sample_size,
      tags: a.tags || [],
    }));

  return agents;
}

export function exportAllData(registryPath, outputDir) {
  const registry = loadRegistry(registryPath);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'stats'), { recursive: true });

  const summary = exportSummary(registry);
  fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));

  const agents = exportAgentsList(registry);
  fs.writeFileSync(path.join(outputDir, 'agents.json'), JSON.stringify(agents, null, 2));

  const teams = exportTeams(registry);
  fs.writeFileSync(path.join(outputDir, 'teams.json'), JSON.stringify(teams, null, 2));

  const leaderboard = exportLeaderboard(registry);
  fs.writeFileSync(path.join(outputDir, 'leaderboard.json'), JSON.stringify(leaderboard, null, 2));

  const db = getDb();
  const statsDir = path.join(outputDir, 'stats');
  const trackedAgents = db.prepare('SELECT DISTINCT agent_id FROM executions').all();
  for (const { agent_id } of trackedAgents) {
    const detail = exportAgentDetail(agent_id);
    const safeName = agent_id.replace(/[^a-z0-9._-]/gi, '-');
    const filePath = safePath(statsDir, `${safeName}.json`);
    // Defend against symlink attacks: refuse to write if target is a symlink
    if (fs.existsSync(filePath) && fs.lstatSync(filePath).isSymbolicLink()) {
      throw new Error(`Symlink detected at ${filePath}, refusing to write`);
    }
    fs.writeFileSync(filePath, JSON.stringify(detail, null, 2));
  }

  return {
    summary,
    agentCount: agents.length,
    teamCount: teams.length,
    leaderboardCount: leaderboard.length,
    detailCount: trackedAgents.length,
  };
}
