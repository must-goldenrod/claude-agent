import fs from 'fs';
import path from 'path';
import { parseFrontmatter, buildMeta, computeContentHash, attachPerformance } from './packager.js';
import { getDb } from './db.js';

export function installAgent(agentName, registryDir, targetDir) {
  const agentDir = path.join(registryDir, 'agents', agentName);
  const agentFile = path.join(agentDir, 'agent.md');

  if (!fs.existsSync(agentFile)) {
    return { success: false, error: `Agent '${agentName}' not found in registry` };
  }

  const content = fs.readFileSync(agentFile, 'utf8');
  const targetPath = path.join(targetDir, `${agentName}.md`);

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(targetPath, content);

  // Store publisher profile if available
  const metaFile = path.join(agentDir, 'agent.meta.json');
  if (fs.existsSync(metaFile)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      if (meta.performance) {
        storePublisherProfile(agentName, meta);
      }
    } catch {
      // Skip if meta is malformed
    }
  }

  return { success: true, path: targetPath };
}

export function storePublisherProfile(agentName, meta) {
  const perf = meta.performance;
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO publisher_profiles
    (agent_id, publisher_quality, publisher_efficiency, publisher_reliability,
     publisher_impact, publisher_composite, publisher_sample_size,
     publisher_context, meta_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    agentName,
    perf.quality, perf.efficiency, perf.reliability,
    perf.impact, perf.composite, perf.sample_size,
    JSON.stringify(perf.context || {}),
    JSON.stringify(meta)
  );
}

export function getPublisherProfile(agentId) {
  const db = getDb();
  return db.prepare('SELECT * FROM publisher_profiles WHERE agent_id = ?').get(agentId) || null;
}

export function exportAgent(agentFilePath, outputDir, overrides = {}) {
  if (!fs.existsSync(agentFilePath)) {
    return { success: false, error: `File not found: ${agentFilePath}` };
  }

  const content = fs.readFileSync(agentFilePath, 'utf8');
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    return { success: false, error: 'No frontmatter found in agent file' };
  }

  const meta = buildMeta(frontmatter, overrides);
  meta.content_hash = computeContentHash(content);
  attachPerformance(meta, frontmatter.name || path.basename(agentFilePath, '.md'));

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'agent.md'), content);
  fs.writeFileSync(path.join(outputDir, 'agent.meta.json'), JSON.stringify(meta, null, 2));

  return { success: true, meta };
}
