#!/usr/bin/env node

import { createDb } from '../../marketplace/src/db.js';
import { recordExecution } from '../../marketplace/src/tracker.js';
import { shouldTrack, parseHookInput, detectProjectType } from '../../marketplace/src/hook-parser.js';
import { readTimingStart } from '../../marketplace/src/timing.js';

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

    const pid = process.ppid || process.pid;
    const timing = readTimingStart(pid);
    const durationMs = timing ? Date.now() - timing.startTime : null;
    const callOrder = timing ? timing.callOrder : null;

    recordExecution({
      agentId: parsed.agentId,
      model: parsed.model,
      sessionId: process.env.CLAUDE_SESSION_ID || null,
      promptPreview: parsed.promptPreview,
      output: parsed.output,
      durationMs,
      outputLength: parsed.outputLength,
      tokenEstimate: parsed.tokenEstimate,
      callOrder,
      projectType: detectProjectType(),
      modelVersion: parsed.model || null,
    });
  } catch (err) {
    process.stderr.write(`[agent-tracker] ${err.message}\n`);
  }
}

main();
