import fs from 'fs';
import path from 'path';
import { parseFrontmatter, buildMeta, computeContentHash } from './packager.js';

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

  return { success: true, path: targetPath };
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

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'agent.md'), content);
  fs.writeFileSync(path.join(outputDir, 'agent.meta.json'), JSON.stringify(meta, null, 2));

  return { success: true, meta };
}
