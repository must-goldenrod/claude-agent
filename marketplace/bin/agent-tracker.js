#!/usr/bin/env node

import { Command } from 'commander';
import { createDb } from '../src/db.js';
import { formatStats, formatExecutions, formatAllAgents, formatCompositeScore, formatEvalReport } from '../src/cli.js';
import { recordUserFeedback } from '../src/evaluator.js';
import { evaluateAgentBatch } from '../src/llm-eval.js';

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

const evalCmd = program.command('eval').description('Evaluate agent quality');

evalCmd
  .command('llm <agent-id>')
  .description('Run LLM evaluation on recent executions')
  .option('-n, --last <number>', 'Number of executions to evaluate', '5')
  .action(async (agentId, opts) => {
    createDb();
    console.log(`Evaluating ${agentId} (last ${opts.last} unevaluated)...`);
    const results = await evaluateAgentBatch(agentId, parseInt(opts.last));
    for (const r of results) {
      if (r.error) {
        console.log(`  #${r.executionId}: ERROR - ${r.error}`);
      } else {
        console.log(`  #${r.executionId}: ${r.avgScore.toFixed(2)} (${r.model})`);
      }
    }
    console.log(`\n${formatEvalReport(agentId)}`);
  });

evalCmd
  .command('rate <execution-id>')
  .description('Rate an execution manually')
  .requiredOption('-s, --score <number>', 'Score 0.0-1.0')
  .option('-c, --comment <text>', 'Optional comment')
  .action((executionId, opts) => {
    createDb();
    const score = parseFloat(opts.score);
    if (score < 0 || score > 1) {
      console.error('Score must be between 0.0 and 1.0');
      process.exit(1);
    }
    recordUserFeedback(parseInt(executionId), score, opts.comment || '');
    console.log(`Recorded user feedback: ${score}`);
    console.log(formatCompositeScore(parseInt(executionId)));
  });

evalCmd
  .command('report <agent-id>')
  .description('Show evaluation report for an agent')
  .action((agentId) => {
    createDb();
    console.log(formatEvalReport(agentId));
  });

evalCmd
  .command('score <execution-id>')
  .description('Show composite score for an execution')
  .action((executionId) => {
    createDb();
    console.log(formatCompositeScore(parseInt(executionId)));
  });

program.parse();
