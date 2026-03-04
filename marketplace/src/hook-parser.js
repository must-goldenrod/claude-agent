export function shouldTrack(hookInput) {
  return hookInput?.tool_name === 'Agent';
}

export function parseHookInput(hookInput) {
  const toolInput = hookInput.tool_input || {};
  return {
    agentId: toolInput.subagent_type || toolInput.name || 'unknown',
    model: toolInput.model,
    promptPreview: toolInput.prompt,
    description: toolInput.description,
    output: hookInput.tool_output || '',
  };
}
