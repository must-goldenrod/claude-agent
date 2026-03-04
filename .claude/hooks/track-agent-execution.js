#!/usr/bin/env node

// Claude Code PostToolUse hook for tracking agent executions.
// Reads hook input from stdin, records to SQLite via marketplace modules.

import { createDb } from '../../marketplace/src/db.js';
import { recordExecution } from '../../marketplace/src/tracker.js';
import { shouldTrack, parseHookInput } from '../../marketplace/src/hook-parser.js';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  let input;
  try {
    const raw = await readStdin();
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  if (!shouldTrack(input)) {
    process.exit(0);
  }

  try {
    createDb();
    const parsed = parseHookInput(input);
    recordExecution({
      agentId: parsed.agentId,
      model: parsed.model,
      sessionId: process.env.CLAUDE_SESSION_ID || null,
      promptPreview: parsed.promptPreview,
      output: parsed.output,
    });
  } catch (err) {
    process.stderr.write(`[agent-tracker] ${err.message}\n`);
  }
}

main();
