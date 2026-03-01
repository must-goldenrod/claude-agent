# Orchestrated Agent Teams Design

> Date: 2026-03-01
> Status: Approved

## Overview

작은 단위의 업무를 확실하게 작동하는 서브에이전트들이 처리하고,
구조화된 시스템(오케스트레이터 → 팀리더 → 팀원)에 의해 운영되는 멀티에이전트 파이프라인.

## Architecture

### Hierarchy

```
사용자
  └── 오케스트레이터 (스킬) — 메인 대화에서 실행
        ├── 조사팀 리더 (에이전트, opus)
        │     ├── web-researcher (sonnet)
        │     ├── market-analyst (sonnet)
        │     ├── tech-researcher (sonnet)
        │     ├── trend-analyst (sonnet)
        │     └── competitor-analyst (sonnet)
        ├── 토론팀 리더 (에이전트, opus)
        │     ├── optimist (sonnet)
        │     ├── pessimist (sonnet)
        │     ├── realist (sonnet)
        │     ├── innovator (sonnet)
        │     ├── conservative (sonnet)
        │     ├── devils-advocate (sonnet)
        │     └── moderator (sonnet)
        ├── 종합팀 리더 (에이전트, opus)
        │     ├── integrator (sonnet)
        │     ├── strategist (sonnet)
        │     ├── report-writer (sonnet)
        │     ├── execution-planner (sonnet)
        │     ├── risk-manager (sonnet)
        │     ├── metrics-designer (sonnet)
        │     └── change-manager (sonnet)
        └── 품질팀 리더 (에이전트, opus)
              ├── fact-checker (sonnet)
              ├── logic-validator (sonnet)
              ├── bias-detector (sonnet)
              └── final-reviewer (opus)
```

Total: 1 orchestrator skill + 4 team leads + 26 team members = 31 components

### Depth-1 Constraint Workaround

Claude Code subagents cannot call other subagents (depth=1).
Solution: **File-based orchestration with leader resume pattern**.

```
Main conversation (orchestrator) calls team leader (Phase 1)
  → Leader writes task-assignments.json
Main conversation reads assignments, calls team members in parallel (Phase 2)
  → Members write member-{name}.json
Main conversation resumes team leader (Phase 3)
  → Leader reads member results, writes team-report.json
```

### File System as Communication Channel

```
output/{phase-name}/
├── research/
│   ├── task-assignments.json
│   ├── member-web-researcher.json
│   ├── member-market-analyst.json
│   ├── member-tech-researcher.json
│   ├── member-trend-analyst.json
│   ├── member-competitor-analyst.json
│   └── team-report.json
├── debate/
│   ├── task-assignments.json
│   ├── round-1/member-{name}.json
│   ├── round-2/member-{name}.json
│   ├── round-3/member-{name}.json
│   ├── debate-summary.json
│   └── team-report.json
├── synthesis/
│   ├── task-assignments.json
│   ├── member-*.json
│   └── team-report.json
├── quality/
│   ├── task-assignments.json
│   ├── member-*.json
│   └── team-report.json
└── final-report.json
```

## Execution Flow Per Phase

### Standard Team Cycle (Research, Synthesis)

| Step | Actor | Action | Output |
|------|-------|--------|--------|
| 1 | Team leader | Read prior phase results, generate task assignments | task-assignments.json |
| 2 | Team members (parallel) | Read assignment, perform work | member-{name}.json |
| 3 | Team leader (resume) | Read all member results, synthesize team report | team-report.json |

### Debate Team (3-Round Pattern)

| Step | Actor | Action |
|------|-------|--------|
| 1 | debate-lead | Set debate topic and round rules |
| 2 | 6 debaters (parallel) | Round 1: Opening arguments |
| 3 | 6 debaters (parallel) | Round 2: Cross-examination (receives all R1 results) |
| 4 | 6 debaters (parallel) | Round 3: Rebuttal (receives R1+R2 results) |
| 5 | moderator | Summarize all rounds |
| 6 | debate-lead (resume) | Final debate report |

### Quality Gate (QA Loop)

```
quality-lead → 4 reviewers parallel → quality-lead resume
  ├── Go → proceed to next phase
  └── No-Go → re-run affected team (modified prompt), max 3 retries
       └── 3x No-Go → escalate to user
```

## Agent Specifications

### Model Selection

| Role | Model | Rationale |
|------|-------|-----------|
| Team leaders | opus | Need strong synthesis and judgment |
| Most team members | sonnet | Specialized analysis, cost-efficient |
| final-reviewer | opus | Critical quality gate decisions |

### Tool Access

| Team | Tools |
|------|-------|
| Research members | Read, Grep, Glob, WebSearch, WebFetch |
| Debate members | Read (+ WebSearch for innovator) |
| Synthesis members | Read (+ Write for report-writer) |
| Quality members | Read (+ WebSearch/WebFetch for fact-checker) |
| All leaders | Read, Write, Grep, Glob |

### Standardized Output Format

```json
{
  "agent": "agent-name",
  "team": "research|debate|synthesis|quality",
  "phase": "idea-exploration|requirements|architecture|implementation|testing",
  "timestamp": "ISO-8601",
  "input_summary": "what was received",
  "findings": [],
  "recommendations": [],
  "confidence_score": 0.0-1.0,
  "concerns": [],
  "sources": []
}
```

## SDLC Phases

The same 4-team pipeline repeats for each phase:

1. **아이디어·시장 탐색** — Value proposition, target users, MVP hypothesis
2. **요구사항·기획** — Requirements spec, use cases, non-functional requirements
3. **아키텍처·기술 설계** — System architecture, component definitions, interfaces
4. **구현 계획·작업 분해** — WBS, sprint plan, module responsibilities
5. **테스트·릴리즈 전략** — Test plan, release plan, monitoring items

## Error Handling

| Scenario | Response |
|----------|----------|
| Member agent fails | Retry that member only (max 2 retries) |
| Leader resume fails | New leader instance to synthesize member results |
| Quality No-Go | Re-run affected team with modified prompt (max 3 retries) |
| 3x No-Go exhausted | Escalate to user for decision |

## Cost Estimate

| Metric | Per Phase | Full 5-Phase Run |
|--------|-----------|-----------------|
| Agent calls | ~30 | ~150 |
| Parallel batches | ~7 | ~35 |
| Leader calls (opus) | ~8 | ~40 |
| Member calls (sonnet) | ~22 | ~110 |
