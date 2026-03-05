import { calculateProfile } from './profiler.js';
import { getDb } from './db.js';

function bar(score, width = 10) {
  const filled = Math.round(score * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

export function formatProfile(agentId, opts = {}) {
  const profile = calculateProfile(agentId);

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
    '  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
    `  Composite   ${bar(profile.composite)} ${profile.composite.toFixed(2)}`,
    '',
    `  Samples: ${profile.sampleSize} executions`,
  ];

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

export function formatTeamProfiles() {
  const db = getDb();
  const agents = db.prepare('SELECT DISTINCT agent_id FROM executions').all();
  if (agents.length === 0) return 'No agents tracked yet.';
  const profiles = agents.map(({ agent_id }) => ({
    id: agent_id,
    ...calculateProfile(agent_id),
  }));
  profiles.sort((a, b) => b.composite - a.composite);
  const header = '# | Agent | Quality | Efficiency | Reliability | Impact | Composite | Samples';
  const sep = '--|-------|---------|------------|-------------|--------|-----------|--------';
  const rows = profiles.map((p, i) =>
    `${i + 1} | ${p.id} | ${p.quality.toFixed(2)} | ${p.efficiency.toFixed(2)} | ${p.reliability.toFixed(2)} | ${p.impact.toFixed(2)} | ${p.composite.toFixed(2)} | ${p.sampleSize}`
  );
  return [header, sep, ...rows].join('\n');
}
