#!/usr/bin/env node

import crypto from 'crypto';
import { createDb } from '../../marketplace/src/db.js';
import { recordExecution } from '../../marketplace/src/tracker.js';
import { shouldTrack, parseHookInput, detectProjectType } from '../../marketplace/src/hook-parser.js';
import { readTimingStart } from '../../marketplace/src/timing.js';

function hashSessionId(sessionId) {
  if (!sessionId) return null;
  return crypto.createHash('sha256').update(sessionId).digest('hex').slice(0, 16);
}

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
      sessionId: hashSessionId(process.env.CLAUDE_SESSION_ID),
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
    process.stderr.write(`[agent-tracker] execution tracking failed\n`);
  }
}

main();
