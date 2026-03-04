import { describe, it, expect } from 'vitest';
import { parseLlmScores } from '../src/evaluator.js';

describe('LLM Eval Parsing', () => {
  it('extracts valid JSON from response with surrounding text', () => {
    const response = 'Here is my evaluation:\n{"relevance": 0.9, "depth": 0.8, "actionability": 0.85, "consistency": 0.9}';
    const scores = parseLlmScores(response);
    expect(scores.relevance).toBe(0.9);
    expect(scores.depth).toBe(0.8);
    expect(scores.actionability).toBe(0.85);
    expect(scores.consistency).toBe(0.9);
  });

  it('throws on no JSON in response', () => {
    expect(() => parseLlmScores('no json here')).toThrow('No JSON found');
  });

  it('throws on out-of-range scores', () => {
    expect(() => parseLlmScores('{"relevance": 1.5, "depth": 0.8, "actionability": 0.85, "consistency": 0.9}')).toThrow('Invalid score');
  });

  it('throws on missing keys', () => {
    expect(() => parseLlmScores('{"relevance": 0.9, "depth": 0.8}')).toThrow('Invalid score');
  });
});
