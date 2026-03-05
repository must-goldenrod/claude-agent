import fs from 'fs';

export function loadRegistry(registryPath) {
  if (fs.existsSync(registryPath)) {
    return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  }
  return { version: '1.0.0', agents: {}, updated_at: new Date().toISOString() };
}

export function saveRegistry(registry, registryPath) {
  registry.updated_at = new Date().toISOString();
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

export function registerAgent(registry, meta, contentHash) {
  const name = meta.name;
  if (!registry.agents[name]) {
    registry.agents[name] = {
      name,
      description: meta.description || '',
      tags: meta.tags || [],
      model_recommendation: meta.model_recommendation,
      latest: meta.version,
      versions: {},
    };
  }

  registry.agents[name].latest = meta.version;
  registry.agents[name].description = meta.description || registry.agents[name].description;
  registry.agents[name].tags = meta.tags || registry.agents[name].tags;

  if (meta.performance) {
    registry.agents[name].performance = meta.performance;
  }

  registry.agents[name].versions[meta.version] = {
    content_hash: contentHash,
    published_at: new Date().toISOString(),
  };
}

export function searchAgents(registry, query, opts = {}) {
  let results = [];
  for (const entry of Object.values(registry.agents)) {
    const matchesQuery = !query ||
      entry.name.includes(query) ||
      (entry.description && entry.description.includes(query));
    const matchesTag = !opts.tag || (entry.tags && entry.tags.includes(opts.tag));

    if (matchesQuery && matchesTag) {
      if (opts.minScore != null) {
        const composite = entry.performance?.composite ?? 0;
        if (composite < opts.minScore) continue;
      }
      results.push(entry);
    }
  }

  if (opts.sortBy && ['composite', 'quality', 'efficiency', 'reliability', 'impact'].includes(opts.sortBy)) {
    results.sort((a, b) => {
      const aScore = a.performance?.[opts.sortBy] ?? 0;
      const bScore = b.performance?.[opts.sortBy] ?? 0;
      return bScore - aScore;
    });
  }

  return results;
}

export function getAgentEntry(registry, name) {
  return registry.agents[name] || null;
}

export function listAllAgents(registry, opts = {}) {
  let agents = Object.values(registry.agents);

  if (opts.minScore != null) {
    agents = agents.filter(a => (a.performance?.composite ?? 0) >= opts.minScore);
  }

  if (opts.sortBy && ['composite', 'quality', 'efficiency', 'reliability', 'impact'].includes(opts.sortBy)) {
    agents.sort((a, b) => {
      const aScore = a.performance?.[opts.sortBy] ?? 0;
      const bScore = b.performance?.[opts.sortBy] ?? 0;
      return bScore - aScore;
    });
  } else {
    agents.sort((a, b) => a.name.localeCompare(b.name));
  }

  return agents;
}
