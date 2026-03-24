#!/usr/bin/env node

import { checkSecurityGate } from '../../marketplace/src/security-gate.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

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
    // Can't parse input -- allow by default
    process.exit(0);
  }

  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};

  // Only check Write, Edit, Bash
  if (!['Write', 'Edit', 'Bash'].includes(toolName)) {
    process.exit(0);
  }

  try {
    const result = checkSecurityGate(toolName, toolInput, PROJECT_ROOT);

    if (!result.allow) {
      const profile = process.env.HARNESS_HOOK_PROFILE || 'standard';

      if (profile === 'strict') {
        // Block the action
        process.stderr.write(`[security-gate] BLOCKED: ${result.reason}\n`);
        process.exit(2);
      } else {
        // Warn mode (standard/minimal) -- log but allow
        process.stderr.write(`[security-gate] WARNING: ${result.reason}\n`);
        process.exit(0);
      }
    }
  } catch (err) {
    process.stderr.write('[security-gate] check failed\n');
  }

  process.exit(0);
}

main();
