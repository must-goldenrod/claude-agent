const REQUIRED_FIELDS = ['agent', 'team', 'phase', 'timestamp', 'findings', 'recommendations', 'confidence_score'];
const VALID_TEAMS = ['research', 'debate', 'synthesis', 'quality', 'security', 'code', 'testing', 'database', 'devops', 'docs', 'infra'];
const VALID_PHASES = ['idea-exploration', 'requirements', 'architecture', 'implementation', 'testing'];
const VALID_PRIORITIES = ['high', 'medium', 'low'];
const VALID_SEVERITIES = ['critical', 'important', 'minor'];

const TEAM_EXTENSIONS = {
  debate: ['round', 'position', 'arguments', 'counterarguments'],
  quality: ['verdict', 'checklist'],
};

export function validateAgentOutput(outputStr) {
  const errors = [];
  let totalChecks = 0;
  let passedChecks = 0;

  // Check 1: Valid JSON
  totalChecks++;
  let parsed;
  try {
    if (!outputStr || outputStr.trim() === '') throw new Error('Empty');
    parsed = JSON.parse(outputStr);
    passedChecks++;
  } catch {
    return { valid: false, score: 0.0, errors: ['Invalid JSON: cannot parse output'] };
  }

  // Check 2: Required fields
  for (const field of REQUIRED_FIELDS) {
    totalChecks++;
    if (parsed[field] !== undefined && parsed[field] !== null) {
      passedChecks++;
    } else {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check 3: Enum validations
  if (parsed.team) {
    totalChecks++;
    if (VALID_TEAMS.includes(parsed.team)) {
      passedChecks++;
    } else {
      errors.push(`Invalid team: ${parsed.team}`);
    }
  }

  if (parsed.phase) {
    totalChecks++;
    if (VALID_PHASES.includes(parsed.phase)) {
      passedChecks++;
    } else {
      errors.push(`Invalid phase: ${parsed.phase}`);
    }
  }

  // Check 4: confidence_score range
  if (parsed.confidence_score !== undefined) {
    totalChecks++;
    if (typeof parsed.confidence_score === 'number' &&
        parsed.confidence_score >= 0 && parsed.confidence_score <= 1) {
      passedChecks++;
    } else {
      errors.push(`confidence_score must be 0.0-1.0, got: ${parsed.confidence_score}`);
    }
  }

  // Check 5: findings array structure
  if (Array.isArray(parsed.findings)) {
    for (const f of parsed.findings) {
      totalChecks++;
      if (f.title && f.detail) {
        passedChecks++;
      } else {
        errors.push('Finding missing title or detail');
      }
    }
  }

  // Check 6: recommendations enum
  if (Array.isArray(parsed.recommendations)) {
    for (const r of parsed.recommendations) {
      if (r.priority) {
        totalChecks++;
        if (VALID_PRIORITIES.includes(r.priority)) {
          passedChecks++;
        } else {
          errors.push(`Invalid priority: ${r.priority}`);
        }
      }
    }
  }

  // Check 7: concerns severity enum
  if (Array.isArray(parsed.concerns)) {
    for (const c of parsed.concerns) {
      if (c.severity) {
        totalChecks++;
        if (VALID_SEVERITIES.includes(c.severity)) {
          passedChecks++;
        } else {
          errors.push(`Invalid severity: ${c.severity}`);
        }
      }
    }
  }

  // Check 8: Team-specific extensions
  const teamExt = TEAM_EXTENSIONS[parsed.team];
  if (teamExt) {
    for (const field of teamExt) {
      totalChecks++;
      if (parsed[field] !== undefined) {
        passedChecks++;
      } else {
        errors.push(`Team ${parsed.team} missing extension field: ${field}`);
      }
    }
  }

  const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) / 100 : 0;
  return { valid: errors.length === 0, score, errors };
}
