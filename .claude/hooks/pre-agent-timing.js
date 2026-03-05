#!/usr/bin/env node

import { writeTimingStart, readTimingStart } from '../../marketplace/src/timing.js';

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

  if (input?.tool_name !== 'Agent') {
    process.exit(0);
  }

  const pid = process.ppid || process.pid;
  const existing = readTimingStart(pid);
  const callOrder = existing ? existing.callOrder + 1 : 1;

  writeTimingStart(pid, {
    startTime: Date.now(),
    callOrder,
  });
}

main();
