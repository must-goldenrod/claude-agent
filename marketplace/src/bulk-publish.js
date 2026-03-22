import fs from 'fs';
import path from 'path';
import { exportAgent } from './installer.js';
import { loadRegistry, saveRegistry, registerAgent } from './registry.js';
import { parseFrontmatter, computeContentHash } from './packager.js';
import { validateAgentName, safePath } from './sanitize.js';

export function bulkPublish(agentsDir, registryDir, overrides = {}) {
  const registryPath = path.join(registryDir, 'registry.json');
  const reg = loadRegistry(registryPath);

  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  let published = 0;
  let errors = 0;
  let skipped = 0;

  for (const file of files) {
    const agentPath = path.join(agentsDir, file);
    const content = fs.readFileSync(agentPath, 'utf8');
    const fm = parseFrontmatter(content);

    if (!fm || !fm.name) {
      skipped++;
      continue;
    }

    try {
      validateAgentName(fm.name);
    } catch {
      skipped++;
      continue;
    }

    const agentsBase = path.join(registryDir, 'agents');
    const outputDir = safePath(agentsBase, fm.name);
    const result = exportAgent(agentPath, outputDir, overrides);

    if (result.success) {
      registerAgent(reg, result.meta, computeContentHash(content));
      published++;
    } else {
      process.stderr.write(`[bulk-publish] failed to publish "${fm.name}": ${result.error || 'unknown error'}\n`);
      errors++;
    }
  }

  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  saveRegistry(reg, registryPath);

  return { published, errors, skipped, total: files.length };
}
