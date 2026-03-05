import fs from 'fs';
import path from 'path';

export function shouldTrack(hookInput) {
  return hookInput?.tool_name === 'Agent';
}

export function parseHookInput(hookInput) {
  const toolInput = hookInput.tool_input || {};
  const output = hookInput.tool_output || '';
  return {
    agentId: toolInput.subagent_type || toolInput.name || 'unknown',
    model: toolInput.model,
    promptPreview: toolInput.prompt,
    description: toolInput.description,
    output,
    outputLength: output.length,
    tokenEstimate: Math.ceil(output.length / 4),
  };
}

export function detectProjectType(cwd = process.cwd()) {
  const checks = [
    { files: ['tsconfig.json'], type: 'typescript' },
    { files: ['Cargo.toml'], type: 'rust' },
    { files: ['go.mod'], type: 'go' },
    { files: ['pyproject.toml'], type: 'python' },
    { files: ['requirements.txt'], type: 'python' },
    { files: ['package.json'], type: 'javascript' },
  ];
  for (const { files, type } of checks) {
    if (files.some(f => fs.existsSync(path.join(cwd, f)))) return type;
  }
  return 'unknown';
}
