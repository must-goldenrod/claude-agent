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

  registry.agents[name].versions[meta.version] = {
    content_hash: contentHash,
    published_at: new Date().toISOString(),
  };
}

export function searchAgents(registry, query, opts = {}) {
  const results = [];
  for (const entry of Object.values(registry.agents)) {
    const matchesQuery = !query ||
      entry.name.includes(query) ||
      (entry.description && entry.description.includes(query));
    const matchesTag = !opts.tag || (entry.tags && entry.tags.includes(opts.tag));

    if (matchesQuery && matchesTag) {
      results.push(entry);
    }
  }
  return results;
}

export function getAgentEntry(registry, name) {
  return registry.agents[name] || null;
}

export function listAllAgents(registry) {
  return Object.values(registry.agents).sort((a, b) => a.name.localeCompare(b.name));
}
