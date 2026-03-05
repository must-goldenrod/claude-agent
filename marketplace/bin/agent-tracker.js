#!/usr/bin/env node

import { Command } from 'commander';
import { createDb } from '../src/db.js';
import { formatStats, formatExecutions, formatAllAgents, formatCompositeScore, formatEvalReport } from '../src/cli.js';
import { recordUserFeedback } from '../src/evaluator.js';
import { evaluateAgentBatch } from '../src/llm-eval.js';
import { installAgent, exportAgent, getPublisherProfile } from '../src/installer.js';
import { loadRegistry, saveRegistry, registerAgent, searchAgents, listAllAgents } from '../src/registry.js';
import { parseFrontmatter, computeContentHash } from '../src/packager.js';
import { bulkPublish } from '../src/bulk-publish.js';
import { formatProfile, formatProfileComparison, formatTeamProfiles } from '../src/cli-profile.js';
import { refreshProfile, refreshAllProfiles } from '../src/profiler.js';
import path from 'path';
import fs from 'fs';

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

const DEFAULT_REGISTRY = path.join(process.cwd(), 'registry');
const DEFAULT_AGENTS = path.join(process.cwd(), '.claude', 'agents');

const marketCmd = program.command('market').description('Agent marketplace operations');

marketCmd
  .command('search <query>')
  .description('Search for agents in registry')
  .option('-t, --tag <tag>', 'Filter by tag')
  .option('-r, --registry <path>', 'Registry directory', DEFAULT_REGISTRY)
  .action((query, opts) => {
    const reg = loadRegistry(path.join(opts.registry, 'registry.json'));
    const results = searchAgents(reg, query, { tag: opts.tag });
    if (results.length === 0) {
      console.log('No agents found.');
      return;
    }
    for (const r of results) {
      console.log(`${r.name}@${r.latest} - ${r.description || '(no description)'}`);
      if (r.tags.length) console.log(`  tags: ${r.tags.join(', ')}`);
    }
  });

marketCmd
  .command('install <agent-name>')
  .description('Install agent from registry to .claude/agents/')
  .option('-r, --registry <path>', 'Registry directory', DEFAULT_REGISTRY)
  .option('-d, --dir <path>', 'Target agents directory', DEFAULT_AGENTS)
  .action((agentName, opts) => {
    createDb();
    const result = installAgent(agentName, opts.registry, opts.dir);
    if (result.success) {
      console.log(`Installed ${agentName} -> ${result.path}`);
    } else {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
  });

marketCmd
  .command('publish <agent-file>')
  .description('Export agent as a package for the registry')
  .option('-v, --version <version>', 'Version', '0.1.0')
  .option('-a, --author <name>', 'Author name', 'unknown')
  .option('-t, --tags <tags>', 'Comma-separated tags', '')
  .option('-o, --output <dir>', 'Output directory')
  .option('-r, --registry <path>', 'Registry directory', DEFAULT_REGISTRY)
  .action((agentFile, opts) => {
    createDb();
    const tags = opts.tags ? opts.tags.split(',').map(t => t.trim()) : [];
    const agentPath = path.resolve(agentFile);
    const content = fs.readFileSync(agentPath, 'utf8');
    const fm = parseFrontmatter(content);
    const agentName = fm?.name || path.basename(agentFile, '.md');
    const outputDir = opts.output || path.join(opts.registry, 'agents', agentName);

    const result = exportAgent(agentPath, outputDir, {
      version: opts.version, author: opts.author, tags,
    });

    if (!result.success) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    // Update registry index
    const registryPath = path.join(opts.registry, 'registry.json');
    const reg = loadRegistry(registryPath);
    registerAgent(reg, result.meta, computeContentHash(content));
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    saveRegistry(reg, registryPath);

    console.log(`Published ${agentName}@${opts.version} -> ${outputDir}`);
  });

marketCmd
  .command('list')
  .description('List all agents in registry')
  .option('-r, --registry <path>', 'Registry directory', DEFAULT_REGISTRY)
  .action((opts) => {
    const reg = loadRegistry(path.join(opts.registry, 'registry.json'));
    const agents = listAllAgents(reg);
    if (agents.length === 0) {
      console.log('No agents in registry.');
      return;
    }
    const header = 'Name | Version | Tags | Description';
    const sep = '-----|---------|------|------------';
    const rows = agents.map(a =>
      `${a.name} | ${a.latest} | ${(a.tags || []).join(',')} | ${(a.description || '').slice(0, 50)}`
    );
    console.log([header, sep, ...rows].join('\n'));
  });

marketCmd
  .command('bulk-publish <agents-dir>')
  .description('Publish all agents from a directory')
  .option('-v, --version <version>', 'Version for all agents', '0.1.0')
  .option('-a, --author <name>', 'Author name', 'unknown')
  .option('-r, --registry <path>', 'Registry directory', DEFAULT_REGISTRY)
  .action((agentsDir, opts) => {
    const results = bulkPublish(path.resolve(agentsDir), opts.registry, {
      version: opts.version, author: opts.author,
    });
    console.log(`Published: ${results.published}, Skipped: ${results.skipped}, Errors: ${results.errors}`);
  });

const profileCmd = program.command('profile').description('Agent performance profiles');

profileCmd
  .command('show <agent-id>')
  .description('Show 4-axis performance profile')
  .option('--json', 'Output as JSON')
  .action((agentId, opts) => {
    createDb();
    console.log(formatProfile(agentId, { json: opts.json }));
  });

profileCmd
  .command('refresh [agent-id]')
  .description('Recalculate and cache profile')
  .action((agentId) => {
    createDb();
    if (agentId) {
      const profile = refreshProfile(agentId);
      console.log(`Refreshed ${agentId}: composite ${profile.composite.toFixed(2)}`);
    } else {
      const results = refreshAllProfiles();
      console.log(`Refreshed ${results.length} agent profiles.`);
      for (const r of results) {
        console.log(`  ${r.agentId}: ${r.profile.composite.toFixed(2)}`);
      }
    }
  });

profileCmd
  .command('team')
  .description('Show all agent profiles ranked by composite score')
  .action(() => {
    createDb();
    console.log(formatTeamProfiles());
  });

profileCmd
  .command('compare <agent-id>')
  .description('Compare local profile vs publisher profile')
  .action((agentId) => {
    createDb();
    const pubRow = getPublisherProfile(agentId);
    if (!pubRow) {
      console.log(`No publisher profile found for ${agentId}. Install from registry first.`);
      return;
    }
    const publisherProfile = {
      quality: pubRow.publisher_quality,
      efficiency: pubRow.publisher_efficiency,
      reliability: pubRow.publisher_reliability,
      impact: pubRow.publisher_impact,
      composite: pubRow.publisher_composite,
    };
    console.log(formatProfileComparison(agentId, publisherProfile));
  });

program.parse();
