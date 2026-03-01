# Agent Output Format

All agents MUST write their results as valid JSON to the designated output file.

## Standard Output Schema

```json
{
  "agent": "agent-name",
  "team": "research|debate|synthesis|quality",
  "phase": "idea-exploration|requirements|architecture|implementation|testing",
  "timestamp": "ISO-8601",
  "input_summary": "brief description of what was received",
  "findings": [
    {
      "title": "Finding title",
      "detail": "Detailed explanation",
      "evidence": "Supporting data or quotes"
    }
  ],
  "recommendations": [
    {
      "action": "What to do",
      "priority": "high|medium|low",
      "rationale": "Why this matters"
    }
  ],
  "confidence_score": 0.85,
  "concerns": [
    {
      "issue": "Description of the concern",
      "severity": "critical|important|minor",
      "mitigation": "Suggested approach to address it"
    }
  ],
  "sources": ["url or reference string"]
}
```

## Team-Specific Extensions

### Debate Team Members (per round)

Add these fields alongside the standard ones:

```json
{
  "round": 1,
  "position": "opening|cross-exam|rebuttal",
  "arguments": [
    { "claim": "...", "evidence": "...", "strength": "strong|moderate|weak" }
  ],
  "counterarguments": [
    { "target_agent": "optimist", "claim": "...", "rebuttal": "..." }
  ]
}
```

### Quality Team Members

Add these fields:

```json
{
  "verdict": "pass|fail|needs-revision",
  "checklist": [
    { "item": "Check description", "status": "pass|fail", "notes": "Details" }
  ]
}
```

### Team Leaders (team-report)

Add these fields:

```json
{
  "member_summaries": [
    { "agent": "member-name", "key_findings": ["..."], "quality": "high|medium|low" }
  ],
  "consolidated_findings": ["Cross-referenced insights"],
  "team_decision": "Overall team assessment",
  "next_steps": ["Recommended actions for the next team"]
}
```

### Quality Leader (Go/No-Go)

Add these fields:

```json
{
  "verdict": "go|no-go",
  "issues_found": [{ "severity": "critical|important", "description": "...", "affected_team": "research|debate|synthesis" }],
  "required_fixes": ["What must change before re-review"],
  "retry_count": 0
}
```
