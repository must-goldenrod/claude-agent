#!/usr/bin/env node

import { Command } from 'commander';
import { createDb } from '../src/db.js';
import { formatStats, formatExecutions, formatAllAgents } from '../src/cli.js';

const program = new Command();

program
  .name('agent-tracker')
  .description('Track and evaluate Claude Code agent performance')
  .version('0.1.0');

program
  .command('stats <agent-id>')
  .description('Show performance stats for an agent')
  .action((agentId) => {
    createDb();
    console.log(formatStats(agentId));
  });

program
  .command('list [agent-id]')
  .description('List recent executions')
  .option('-n, --limit <number>', 'Number of executions to show', '20')
  .action((agentId, opts) => {
    createDb();
    if (agentId) {
      console.log(formatExecutions(agentId, parseInt(opts.limit)));
    } else {
      console.log(formatAllAgents());
    }
  });

program
  .command('agents')
  .description('List all tracked agents')
  .action(() => {
    createDb();
    console.log(formatAllAgents());
  });

program.parse();
