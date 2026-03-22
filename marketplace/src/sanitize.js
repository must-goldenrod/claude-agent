import path from 'path';

const SAFE_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function validateAgentName(name) {
  if (typeof name !== 'string' || !SAFE_NAME_RE.test(name)) {
    throw new Error(`Invalid agent name: "${name}". Must match ${SAFE_NAME_RE}`);
  }
  return name;
}

export function safePath(baseDir, untrusted) {
  const resolved = path.resolve(baseDir, untrusted);
  const normalizedBase = path.resolve(baseDir);
  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    throw new Error(`Path traversal blocked: "${untrusted}" escapes "${baseDir}"`);
  }
  return resolved;
}

export function validateFiniteNumber(value, label) {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(n)) {
    throw new Error(`${label} must be a finite number, got: ${value}`);
  }
  return n;
}

export function validateScore(value, label = 'Score') {
  const n = validateFiniteNumber(value, label);
  if (n < 0 || n > 1) {
    throw new Error(`${label} must be between 0.0 and 1.0, got: ${n}`);
  }
  return n;
}
