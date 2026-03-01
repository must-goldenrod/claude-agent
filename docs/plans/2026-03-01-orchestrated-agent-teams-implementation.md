# Orchestrated Agent Teams Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build 31 components (1 orchestrator skill + 4 team lead agents + 26 team member agents) that form a file-based orchestrated multi-agent pipeline for end-to-end software project analysis.

**Architecture:** Main conversation runs orchestrator skill which sequentially invokes 4 teams (research → debate → synthesis → quality). Each team uses a 3-phase cycle: leader assigns tasks → members work in parallel → leader resumes to synthesize. File system serves as inter-agent communication channel via JSON files in `output/`.

**Tech Stack:** Claude Code subagents (.md files), skills (SKILL.md), JSON for structured inter-agent communication.

---

### Task 1: Create shared output format schema

**Files:**
- Create: `agents/schemas/output-format.md`

**Step 1: Write the output schema reference document**

```markdown
# Agent Output Format

All agents MUST write their results as valid JSON to the designated output file.

## Standard Output Schema

{
  "agent": "agent-name",
  "team": "research|debate|synthesis|quality",
  "phase": "idea-exploration|requirements|architecture|implementation|testing",
  "timestamp": "ISO-8601",
  "input_summary": "brief description of what was received",
  "findings": [
    { "title": "Finding title", "detail": "Detailed explanation", "evidence": "Supporting data" }
  ],
  "recommendations": [
    { "action": "What to do", "priority": "high|medium|low", "rationale": "Why" }
  ],
  "confidence_score": 0.85,
  "concerns": [
    { "issue": "Description", "severity": "critical|important|minor", "mitigation": "Suggested fix" }
  ],
  "sources": ["url or reference"]
}

## Team-Specific Extensions

### Debate Team Members (per round)
Add `round` (1-3), `position` (opening|cross-exam|rebuttal), `arguments[]`, `counterarguments[]`

### Quality Team Members
Add `verdict` (pass|fail|needs-revision), `checklist[]` with item/status/notes

### Team Leaders (team-report)
Add `member_summaries[]`, `consolidated_findings[]`, `team_decision`, `next_steps[]`
```

**Step 2: Commit**

```bash
git add agents/schemas/output-format.md
git commit -m "feat: add shared agent output format schema"
```

---

### Task 2: Create Research Team Leader agent

**Files:**
- Create: `.claude/agents/research-lead.md`

**Step 1: Write the agent definition**

```markdown
---
model: opus
color: cyan
tools: Read, Write, Grep, Glob
---

# Research Team Leader - manages the research team's investigation cycle.

Use this agent when the orchestrator needs to initiate or synthesize research phase work. This agent operates in two modes: (1) generating task assignments for research team members, and (2) synthesizing member results into a consolidated team report.

<example>
Context: The orchestrator is starting the research phase for a project
user: "Run research phase for: AI healthcare platform"
assistant: "I'll use the research-lead agent to generate task assignments for the research team."
<commentary>Research lead creates structured assignments for each team member.</commentary>
</example>

## System Prompt

You are the Research Team Leader. You manage a team of 5 specialist researchers:
- **web-researcher**: External documentation, blogs, standards, reference implementations
- **market-analyst**: Market size, growth rates, segments, revenue model cases
- **tech-researcher**: Tech stack comparisons, architecture patterns, performance/security references
- **trend-analyst**: Latest technology and business trends (AI, Web3, Fintech regulations, etc.)
- **competitor-analyst**: Competitor feature comparison, benchmarking points, differentiation opportunities

### Mode 1: Task Assignment Generation

When you receive a project description (and optionally prior phase results):

1. Read any prior phase results from `output/` if they exist
2. Analyze the project scope to determine what each team member should investigate
3. Write task assignments to the designated output file

Write to `output/{phase}/research/task-assignments.json`:
```json
{
  "phase": "<current phase>",
  "project_context": "<summarized project description>",
  "assignments": [
    {
      "agent": "web-researcher",
      "task": "specific research task",
      "focus_areas": ["area1", "area2"],
      "expected_output": "what to deliver",
      "constraints": "any limits or focus guidance"
    }
  ]
}
```

### Mode 2: Results Synthesis

When resumed after team members complete their work:

1. Read all member result files from `output/{phase}/research/member-*.json`
2. Cross-reference findings across members
3. Identify agreements, contradictions, and gaps
4. Write consolidated team report

Write to `output/{phase}/research/team-report.json` using the standard output format with these additions:
- `member_summaries`: Brief summary of each member's key findings
- `consolidated_findings`: Cross-referenced insights
- `knowledge_gaps`: Areas needing more investigation
- `team_decision`: Research team's overall assessment
- `next_steps`: Recommended actions for the next team (debate)
```

**Step 2: Commit**

```bash
git add .claude/agents/research-lead.md
git commit -m "feat: add research team leader agent"
```

---

### Task 3: Create Research Team Member agents (5 agents)

**Files:**
- Create: `.claude/agents/web-researcher.md`
- Create: `.claude/agents/market-analyst.md`
- Create: `.claude/agents/tech-researcher.md`
- Create: `.claude/agents/trend-analyst.md`
- Create: `.claude/agents/competitor-analyst.md`

**Step 1: Write web-researcher agent**

```markdown
---
model: sonnet
color: cyan
tools: Read, Grep, Glob, WebSearch, WebFetch, Write
---

# Web Researcher - collects and synthesizes external documentation, technical references, and best practices.

<example>
Context: Research team is investigating a project topic
user: "Research external resources for: AI healthcare platform. Focus: regulatory frameworks, HIPAA compliance, existing open-source solutions. Write results to output/idea-exploration/research/member-web-researcher.json"
assistant: "I'll use the web-researcher agent to gather external documentation and references."
<commentary>Web researcher searches the web for relevant documentation and standards.</commentary>
</example>

## System Prompt

You are a Web Researcher specializing in finding and synthesizing external information.

### Instructions

1. Read your task assignment from the file path provided in the prompt
2. Search the web for relevant documentation, technical blogs, standards, and reference implementations
3. For each finding, record the source URL, key takeaways, and relevance to the project
4. Assess the reliability and recency of each source
5. Write your results as valid JSON to the output file specified in your prompt

### Output

Write results using the standard agent output format. Your `findings` array should include:
- `title`: What was found
- `detail`: Key information extracted
- `evidence`: Direct quotes or data points
- `source_url`: Where it came from
- `source_reliability`: high/medium/low
- `recency`: Publication date if available

Focus on actionable, fact-based findings. Avoid speculation.
```

**Step 2: Write market-analyst agent**

Same structure as web-researcher but with system prompt focused on:
- Market size, growth rates, TAM/SAM/SOM
- Revenue model analysis from comparable companies
- Market segmentation and target demographics
- Tools: `Read, WebSearch, WebFetch, Write`

**Step 3: Write tech-researcher agent**

System prompt focused on:
- Technology stack comparisons (pros/cons matrices)
- Architecture pattern analysis (scalability, maintainability)
- Performance benchmarks and security considerations
- Tools: `Read, Grep, Glob, WebSearch, WebFetch, Write`

**Step 4: Write trend-analyst agent**

System prompt focused on:
- Emerging technology trends relevant to the project domain
- Regulatory landscape changes
- Industry adoption curves
- Tools: `Read, WebSearch, WebFetch, Write`

**Step 5: Write competitor-analyst agent**

System prompt focused on:
- Feature comparison matrices
- Pricing model analysis
- Market positioning and differentiation opportunities
- SWOT analysis per competitor
- Tools: `Read, WebSearch, WebFetch, Write`

**Step 6: Commit**

```bash
git add .claude/agents/web-researcher.md .claude/agents/market-analyst.md \
       .claude/agents/tech-researcher.md .claude/agents/trend-analyst.md \
       .claude/agents/competitor-analyst.md
git commit -m "feat: add 5 research team member agents"
```

---

### Task 4: Create Debate Team Leader agent

**Files:**
- Create: `.claude/agents/debate-lead.md`

**Step 1: Write the agent definition**

System prompt covers:
- Mode 1: Set debate topic, define round rules, assign perspectives to debaters
- Mode 2 (resume): Synthesize 3 rounds of debate into final assessment
- Manages 6 debaters + 1 moderator
- Output: `task-assignments.json` with debate topic, round structure, and per-debater perspective assignments
- Final: `team-report.json` with `arguments[]`, `counterarguments[]`, `risks[]`, `decisions[]`, `consensus_level`
- Model: opus, Color: magenta, Tools: Read, Write, Grep, Glob

**Step 2: Commit**

```bash
git add .claude/agents/debate-lead.md
git commit -m "feat: add debate team leader agent"
```

---

### Task 5: Create Debate Team Member agents (7 agents)

**Files:**
- Create: `.claude/agents/optimist.md`
- Create: `.claude/agents/pessimist.md`
- Create: `.claude/agents/realist.md`
- Create: `.claude/agents/innovator.md`
- Create: `.claude/agents/conservative.md`
- Create: `.claude/agents/devils-advocate.md`
- Create: `.claude/agents/moderator.md`

**Step 1: Write all 7 debate agents**

Each debater agent:
- Model: sonnet, Color: magenta
- Tools: Read, Write (+ WebSearch for innovator)
- Receives: debate topic + prior round results in prompt
- Outputs: arguments with evidence, responses to other positions
- Round-aware: adapts output format based on round number (opening/cross-exam/rebuttal)

The **moderator** is special:
- Runs after all 3 rounds complete
- Reads all round-1, round-2, round-3 member files
- Produces `debate-summary.json` with: key arguments per position, areas of agreement/disagreement, unresolved tensions, recommended consensus points

**Step 2: Commit**

```bash
git add .claude/agents/optimist.md .claude/agents/pessimist.md \
       .claude/agents/realist.md .claude/agents/innovator.md \
       .claude/agents/conservative.md .claude/agents/devils-advocate.md \
       .claude/agents/moderator.md
git commit -m "feat: add 7 debate team member agents"
```

---

### Task 6: Create Synthesis Team Leader agent

**Files:**
- Create: `.claude/agents/synthesis-lead.md`

**Step 1: Write the agent definition**

- Model: opus, Color: green, Tools: Read, Write, Grep, Glob
- Mode 1: Read research + debate reports, create synthesis assignments
- Mode 2 (resume): Integrate all member outputs into coherent strategy document
- Manages 7 members: integrator, strategist, report-writer, execution-planner, risk-manager, metrics-designer, change-manager

**Step 2: Commit**

```bash
git add .claude/agents/synthesis-lead.md
git commit -m "feat: add synthesis team leader agent"
```

---

### Task 7: Create Synthesis Team Member agents (7 agents)

**Files:**
- Create: `.claude/agents/integrator.md`
- Create: `.claude/agents/strategist.md`
- Create: `.claude/agents/report-writer.md`
- Create: `.claude/agents/execution-planner.md`
- Create: `.claude/agents/risk-manager.md`
- Create: `.claude/agents/metrics-designer.md`
- Create: `.claude/agents/change-manager.md`

**Step 1: Write all 7 synthesis agents**

Each agent:
- Model: sonnet, Color: green
- Tools: Read, Write
- Reads: task assignment + research/debate team reports
- Outputs: specialized analysis in standard JSON format

Key specializations:
- **integrator**: Cross-references research+debate, extracts core insights
- **strategist**: Defines roadmap, priorities, go-to-market approach
- **report-writer**: Generates human-readable decision documents
- **execution-planner**: Breaks strategy into epics/sprints/tasks
- **risk-manager**: Risk registry with likelihood/impact/mitigation
- **metrics-designer**: KPIs, OKRs, monitoring dashboards
- **change-manager**: Impact analysis for scope changes

**Step 2: Commit**

```bash
git add .claude/agents/integrator.md .claude/agents/strategist.md \
       .claude/agents/report-writer.md .claude/agents/execution-planner.md \
       .claude/agents/risk-manager.md .claude/agents/metrics-designer.md \
       .claude/agents/change-manager.md
git commit -m "feat: add 7 synthesis team member agents"
```

---

### Task 8: Create Quality Team Leader agent

**Files:**
- Create: `.claude/agents/quality-lead.md`

**Step 1: Write the agent definition**

- Model: opus, Color: red, Tools: Read, Write, Grep, Glob
- Mode 1: Define quality checklist based on current SDLC phase, assign review areas
- Mode 2 (resume): Aggregate reviewer findings, make Go/No-Go decision
- Output includes: `verdict` (go/no-go), `issues_found[]`, `required_fixes[]`, `retry_guidance` (if no-go)
- If No-Go: provides specific feedback for which team needs to re-run and what to fix

**Step 2: Commit**

```bash
git add .claude/agents/quality-lead.md
git commit -m "feat: add quality team leader agent"
```

---

### Task 9: Create Quality Team Member agents (4 agents)

**Files:**
- Create: `.claude/agents/fact-checker.md`
- Create: `.claude/agents/logic-validator.md`
- Create: `.claude/agents/bias-detector.md`
- Create: `.claude/agents/final-reviewer.md`

**Step 1: Write all 4 quality agents**

- **fact-checker** (sonnet, tools: Read, WebSearch, WebFetch, Write): Verifies claims against external sources, checks data accuracy, flags unverifiable assertions
- **logic-validator** (sonnet, tools: Read, Write): Finds logical contradictions, circular reasoning, unsupported premises, gaps in argument chains
- **bias-detector** (sonnet, tools: Read, Write): Identifies overoptimism/pessimism, vendor bias, confirmation bias, anchoring bias, groupthink
- **final-reviewer** (opus, tools: Read, Write): Holistic quality gate — checks completeness, consistency across all outputs, readiness for next phase

**Step 2: Commit**

```bash
git add .claude/agents/fact-checker.md .claude/agents/logic-validator.md \
       .claude/agents/bias-detector.md .claude/agents/final-reviewer.md
git commit -m "feat: add 4 quality team member agents"
```

---

### Task 10: Create Orchestrator Skill

**Files:**
- Create: `.claude/skills/orchestrator/SKILL.md`

**Step 1: Write the orchestrator skill**

The skill defines the complete pipeline logic that the main conversation follows:

```markdown
---
name: orchestrator
description: Run the full multi-agent pipeline for a project. Manages 4 teams (research → debate → synthesis → quality) through file-based orchestration.
---

# Project Orchestrator

## Invocation
/orchestrator <project-description>

## Pipeline Execution

For each SDLC phase (idea-exploration → requirements → architecture → implementation → testing):

### Step 1: Initialize
- Create output directory: `output/{phase-name}/`
- Create subdirectories: research/, debate/, synthesis/, quality/

### Step 2: Run Research Team
1. Call `research-lead` agent with project description (and prior phase results if any)
   - Prompt must include: project description, current phase, output path
   - Wait for task-assignments.json
2. Read task-assignments.json, call all 5 research members IN PARALLEL
   - Each member prompt includes: their specific assignment, output file path
3. Resume `research-lead` agent
   - Prompt: "Your team has completed their work. Read member results and write team report."

### Step 3: Run Debate Team
1. Call `debate-lead` with research team report
2. Round 1 (Opening): Call 6 debaters in parallel (excluding moderator)
3. Round 2 (Cross-exam): Call 6 debaters in parallel with all R1 results in prompt
4. Round 3 (Rebuttal): Call 6 debaters in parallel with R1+R2 results in prompt
5. Call `moderator` with all round results
6. Resume `debate-lead` with moderator summary

### Step 4: Run Synthesis Team
1. Call `synthesis-lead` with research + debate team reports
2. Call all 7 synthesis members in parallel
3. Resume `synthesis-lead`

### Step 5: Run Quality Team
1. Call `quality-lead` with all prior team reports
2. Call all 4 quality members in parallel
3. Resume `quality-lead` for Go/No-Go verdict

### Step 6: Quality Gate
- If Go: Summarize phase results to user, proceed to next phase
- If No-Go: Read required_fixes, re-run affected team with fixes (max 3 retries)
- If 3x No-Go: Present issues to user for decision

### Step 7: Phase Summary
- Read all team reports
- Present consolidated phase summary to user
- Ask user to proceed to next phase or stop
```

**Step 2: Commit**

```bash
git add .claude/skills/orchestrator/SKILL.md
git commit -m "feat: add orchestrator skill for pipeline control"
```

---

### Task 11: Verification — Test single team cycle

**Step 1: Create a minimal test scenario**

Create `tests/test-scenario.md` with a simple project description to test the research team cycle end-to-end.

**Step 2: Run research team manually**

1. Call research-lead with test scenario
2. Verify task-assignments.json is created and valid
3. Call one research member (web-researcher) with assignment
4. Verify member output is valid JSON matching schema
5. Resume research-lead
6. Verify team-report.json is created with member_summaries

**Step 3: Document results**

Record what worked and what needs adjustment in `tests/verification-log.md`.

**Step 4: Commit**

```bash
git add tests/
git commit -m "test: verify research team cycle end-to-end"
```

---

### Task 12: Update CLAUDE.md and project docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `catalog/inventory.md`

**Step 1: Update CLAUDE.md** with new directory structure and agent conventions

**Step 2: Update inventory** to include all 30 new agents

**Step 3: Commit**

```bash
git add CLAUDE.md catalog/inventory.md
git commit -m "docs: update project docs with new agent inventory"
```
