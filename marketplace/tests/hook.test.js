import { describe, it, expect } from 'vitest';
import { parseHookInput, shouldTrack } from '../src/hook-parser.js';

describe('Hook Parser', () => {
  it('parses valid Agent PostToolUse input', () => {
    const input = {
      tool_name: 'Agent',
      tool_input: {
        prompt: 'Audit the auth code for vulnerabilities',
        subagent_type: 'security-auditor',
        description: 'Audit code security',
        model: 'sonnet',
      },
      tool_output: '{"agent":"security-auditor","team":"security"}',
    };

    const parsed = parseHookInput(input);
    expect(parsed.agentId).toBe('security-auditor');
    expect(parsed.model).toBe('sonnet');
    expect(parsed.promptPreview).toBe('Audit the auth code for vulnerabilities');
    expect(parsed.output).toContain('security-auditor');
  });

  it('shouldTrack returns true for Agent tool', () => {
    expect(shouldTrack({ tool_name: 'Agent' })).toBe(true);
  });

  it('shouldTrack returns false for non-Agent tools', () => {
    expect(shouldTrack({ tool_name: 'Read' })).toBe(false);
    expect(shouldTrack({ tool_name: 'Bash' })).toBe(false);
  });

  it('handles missing fields gracefully', () => {
    const input = {
      tool_name: 'Agent',
      tool_input: { subagent_type: 'test' },
      tool_output: '',
    };
    const parsed = parseHookInput(input);
    expect(parsed.agentId).toBe('test');
    expect(parsed.model).toBeUndefined();
  });

  it('parseHookInput extracts output_length', () => {
    const input = {
      tool_name: 'Agent',
      tool_input: { subagent_type: 'test', prompt: 'do stuff' },
      tool_output: 'Hello world output',
    };
    const parsed = parseHookInput(input);
    expect(parsed.outputLength).toBe(18);
  });

  it('parseHookInput estimates tokens from output', () => {
    const output = 'a'.repeat(400);
    const input = {
      tool_name: 'Agent',
      tool_input: { subagent_type: 'test' },
      tool_output: output,
    };
    const parsed = parseHookInput(input);
    expect(parsed.tokenEstimate).toBe(100);
  });
});
