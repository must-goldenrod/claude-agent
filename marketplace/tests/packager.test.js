import { describe, it, expect } from 'vitest';
import { parseFrontmatter, buildMeta, computeContentHash } from '../src/packager.js';

const SAMPLE_AGENT_MD = `---
name: security-auditor
description: Reviews code for OWASP Top 10 vulnerabilities
tools: Read, Grep, Glob, Bash, Write
model: sonnet
color: red
---

# Security Auditor

You are the Security Auditor.`;

describe('Packager', () => {
  it('parseFrontmatter extracts YAML fields', () => {
    const fm = parseFrontmatter(SAMPLE_AGENT_MD);
    expect(fm.name).toBe('security-auditor');
    expect(fm.description).toContain('OWASP');
    expect(fm.model).toBe('sonnet');
    expect(fm.color).toBe('red');
  });

  it('parseFrontmatter returns null for no frontmatter', () => {
    const fm = parseFrontmatter('# No frontmatter here');
    expect(fm).toBeNull();
  });

  it('buildMeta creates valid meta.json structure', () => {
    const fm = parseFrontmatter(SAMPLE_AGENT_MD);
    const meta = buildMeta(fm, { version: '1.0.0', author: 'mufin', tags: ['security', 'owasp'] });
    expect(meta.name).toBe('security-auditor');
    expect(meta.version).toBe('1.0.0');
    expect(meta.author).toBe('mufin');
    expect(meta.tags).toEqual(['security', 'owasp']);
    expect(meta.model_recommendation).toBe('sonnet');
    expect(meta.license).toBe('MIT');
  });

  it('computeContentHash produces consistent hash', () => {
    const h1 = computeContentHash(SAMPLE_AGENT_MD);
    const h2 = computeContentHash(SAMPLE_AGENT_MD);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(16);
  });

  it('computeContentHash changes when content changes', () => {
    const h1 = computeContentHash(SAMPLE_AGENT_MD);
    const h2 = computeContentHash(SAMPLE_AGENT_MD + '\nmodified');
    expect(h1).not.toBe(h2);
  });
});
