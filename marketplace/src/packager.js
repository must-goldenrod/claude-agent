import crypto from 'crypto';

export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fields = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    fields[key] = value;
  }
  return fields;
}

export function buildMeta(frontmatter, overrides = {}) {
  return {
    name: frontmatter.name,
    display_name: frontmatter.name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
    version: overrides.version || '0.1.0',
    description: frontmatter.description || '',
    author: overrides.author || 'unknown',
    license: overrides.license || 'MIT',
    tags: overrides.tags || [],
    team_compatibility: frontmatter.team ? [frontmatter.team] : [],
    model_recommendation: frontmatter.model || 'sonnet',
    avg_score: null,
    total_executions: 0,
    dependencies: [],
    claude_code_version: '>=1.0.0',
  };
}

export function computeContentHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}
