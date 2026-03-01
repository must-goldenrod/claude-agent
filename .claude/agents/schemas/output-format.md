# Standard Output Fields

Every agent report JSON includes these standard fields alongside agent-specific fields:

```json
{
  "findings": [
    { "title": "Finding", "detail": "Explanation", "evidence": "Data" }
  ],
  "recommendations": [
    { "action": "What to do", "priority": "high|medium|low", "rationale": "Why" }
  ],
  "confidence_score": 0.85,
  "concerns": [
    { "issue": "Description", "severity": "critical|important|minor", "mitigation": "Approach" }
  ],
  "sources": ["List of sources consulted"]
}
```
