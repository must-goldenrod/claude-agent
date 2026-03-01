---
name: orchestrator
description: Run the full multi-agent pipeline for a project. Manages 4 teams (research → debate → synthesis → quality) through file-based orchestration with leader resume pattern.
---

# Project Orchestrator

End-to-end multi-agent pipeline that takes a project description and runs it through 4 specialized teams to produce comprehensive analysis, debate, strategy, and quality-verified deliverables.

## Invocation

`/orchestrator <project-description>`

## Pipeline Overview

```
Input: Project description
  → Research Team (investigate)
  → Debate Team (argue perspectives)
  → Synthesis Team (integrate & strategize)
  → Quality Team (verify & gate)
  → Output: Verified deliverables to user
```

Each SDLC phase repeats this pipeline:
1. idea-exploration
2. requirements
3. architecture
4. implementation
5. testing

## Execution Protocol

### Step 0: Initialize

Create the output directory structure:

```bash
mkdir -p output/{phase-name}/{research,debate/round-1,debate/round-2,debate/round-3,synthesis,quality}
```

Announce to user: "Starting {phase-name} phase. Running 4-team pipeline: Research → Debate → Synthesis → Quality."

---

### Step 1: Research Team

**Phase 1 — Leader assigns tasks:**
Call `research-lead` agent:
```
Prompt: "You are in TASK ASSIGNMENT mode.
Project: {project-description}
Phase: {phase-name}
Prior phase results: {path to prior phase final-report.json, or 'none'}
Write task assignments to: output/{phase-name}/research/task-assignments.json"
```

**Phase 2 — Members work in parallel:**
Read `output/{phase-name}/research/task-assignments.json`.
For each assignment, call the corresponding member agent IN PARALLEL:
- `web-researcher`
- `market-analyst`
- `tech-researcher`
- `trend-analyst`
- `competitor-analyst`

Each member prompt:
```
"Your assignment: {assignment from task-assignments.json}
Read your full assignment from: output/{phase-name}/research/task-assignments.json
Write your results to: output/{phase-name}/research/member-{agent-name}.json"
```

**Phase 3 — Leader synthesizes:**
Resume `research-lead` agent:
```
"Your team has completed their work. You are now in SYNTHESIS mode.
Read all member results from: output/{phase-name}/research/member-*.json
Write consolidated team report to: output/{phase-name}/research/team-report.json"
```

Report to user: "Research team complete. Key findings: {brief summary from team-report}."

---

### Step 2: Debate Team

**Phase 1 — Leader sets up debate:**
Call `debate-lead` agent:
```
"You are in SETUP mode.
Read research team report: output/{phase-name}/research/team-report.json
Phase: {phase-name}
Project: {project-description}
Write debate setup to: output/{phase-name}/debate/task-assignments.json"
```

**Phase 2 — Round 1 (Opening):**
Call 6 debaters IN PARALLEL (optimist, pessimist, realist, innovator, conservative, devils-advocate):
```
"Round 1: Opening Arguments.
Read debate topic from: output/{phase-name}/debate/task-assignments.json
Read research findings from: output/{phase-name}/research/team-report.json
Your perspective: {perspective from assignment}
Write your arguments to: output/{phase-name}/debate/round-1/member-{agent-name}.json"
```

**Phase 3 — Round 2 (Cross-Examination):**
Call 6 debaters IN PARALLEL with all R1 results:
```
"Round 2: Cross-Examination.
Read ALL Round 1 results from: output/{phase-name}/debate/round-1/
Respond to other positions. Challenge weak arguments. Defend your position.
Write to: output/{phase-name}/debate/round-2/member-{agent-name}.json"
```

**Phase 4 — Round 3 (Rebuttal):**
Call 6 debaters IN PARALLEL with R1+R2 results:
```
"Round 3: Final Rebuttal.
Read Round 1 results from: output/{phase-name}/debate/round-1/
Read Round 2 results from: output/{phase-name}/debate/round-2/
Present your strongest refined arguments. Address remaining counterpoints.
Write to: output/{phase-name}/debate/round-3/member-{agent-name}.json"
```

**Phase 5 — Moderator summarizes:**
Call `moderator`:
```
"Summarize the complete 3-round debate.
Read all rounds from: output/{phase-name}/debate/round-1/, round-2/, round-3/
Write debate summary to: output/{phase-name}/debate/debate-summary.json"
```

**Phase 6 — Leader synthesizes:**
Resume `debate-lead`:
```
"You are in SYNTHESIS mode.
Read moderator summary: output/{phase-name}/debate/debate-summary.json
Read all round results for full context.
Write final debate report to: output/{phase-name}/debate/team-report.json"
```

Report to user: "Debate team complete. Consensus level: {level}. Key decisions: {brief}."

---

### Step 3: Synthesis Team

**Phase 1 — Leader assigns:**
Call `synthesis-lead`:
```
"You are in ASSIGNMENT mode.
Read research report: output/{phase-name}/research/team-report.json
Read debate report: output/{phase-name}/debate/team-report.json
Phase: {phase-name}
Write assignments to: output/{phase-name}/synthesis/task-assignments.json"
```

**Phase 2 — Members work in parallel:**
Call all 7 members IN PARALLEL (integrator, strategist, report-writer, execution-planner, risk-manager, metrics-designer, change-manager):
```
"Your assignment: {from task-assignments.json}
Read upstream reports from: output/{phase-name}/research/ and output/{phase-name}/debate/
Write results to: output/{phase-name}/synthesis/member-{agent-name}.json"
```

**Phase 3 — Leader integrates:**
Resume `synthesis-lead`:
```
"You are in INTEGRATION mode.
Read all member outputs from: output/{phase-name}/synthesis/member-*.json
Write consolidated team report to: output/{phase-name}/synthesis/team-report.json"
```

Report to user: "Synthesis team complete. Strategy defined. Proceeding to quality review."

---

### Step 4: Quality Team

**Phase 1 — Leader defines quality criteria:**
Call `quality-lead`:
```
"You are in SETUP mode.
Phase: {phase-name}
Read all team reports:
  - output/{phase-name}/research/team-report.json
  - output/{phase-name}/debate/team-report.json
  - output/{phase-name}/synthesis/team-report.json
Write quality criteria and assignments to: output/{phase-name}/quality/task-assignments.json"
```

**Phase 2 — Reviewers examine in parallel:**
Call 4 reviewers IN PARALLEL (fact-checker, logic-validator, bias-detector, final-reviewer):
```
"Your review assignment: {from task-assignments.json}
Read all team reports from: output/{phase-name}/
Write review results to: output/{phase-name}/quality/member-{agent-name}.json"
```

**Phase 3 — Leader delivers verdict:**
Resume `quality-lead`:
```
"You are in VERDICT mode.
Read all reviewer results from: output/{phase-name}/quality/member-*.json
Make Go/No-Go decision.
Write verdict to: output/{phase-name}/quality/team-report.json"
```

---

### Step 5: Quality Gate

Read `output/{phase-name}/quality/team-report.json`.

**If verdict = "go":**
- Report to user: "Quality gate PASSED. Phase {phase-name} complete."
- Read all team reports and present a consolidated phase summary to the user.
- Ask user: "Proceed to next phase ({next-phase-name})?"

**If verdict = "no-go":**
- Read `required_fixes` and `retry_guidance` from the verdict.
- Report to user: "Quality gate FAILED (attempt {retry_count}/3). Issues: {summary}."
- Re-run the affected team(s) with modified prompts incorporating the fixes.
- Re-run quality team on the revised output.
- Maximum 3 retries. After 3 failures, present all issues to user for manual decision.

---

### Step 6: Phase Completion

After quality gate passes:

1. Generate `output/{phase-name}/final-report.json` combining all team reports.
2. Present executive summary to user with:
   - Key findings from research
   - Debate consensus and unresolved tensions
   - Strategic recommendations from synthesis
   - Quality assessment score
3. Ask user to proceed to next phase or stop.

---

## Error Handling

| Scenario | Action |
|----------|--------|
| Member agent returns empty/invalid output | Retry that member (max 2 attempts) |
| Leader resume fails | Create new leader instance, provide member results in prompt |
| Quality No-Go | Re-run affected team with fix guidance (max 3 retries) |
| 3x No-Go exhausted | Present all issues to user, ask for direction |
| User requests stop | Save current state, summarize progress, exit gracefully |
