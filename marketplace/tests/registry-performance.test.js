import { describe, it, expect } from 'vitest';
import { registerAgent, searchAgents, listAllAgents } from '../src/registry.js';

function makeRegistry() {
  const reg = { version: '1.0.0', agents: {}, updated_at: new Date().toISOString() };

  registerAgent(reg, {
    name: 'high-scorer', version: '1.0.0', description: 'Top agent',
    tags: ['security'], performance: { quality: 0.9, efficiency: 0.8, reliability: 0.95, impact: 0.7, composite: 0.87, sample_size: 100 },
  }, 'hash1');

  registerAgent(reg, {
    name: 'mid-scorer', version: '1.0.0', description: 'Average agent',
    tags: ['code'], performance: { quality: 0.6, efficiency: 0.5, reliability: 0.7, impact: 0.4, composite: 0.57, sample_size: 50 },
  }, 'hash2');

  registerAgent(reg, {
    name: 'no-perf', version: '1.0.0', description: 'No performance data',
    tags: ['docs'],
  }, 'hash3');

  return reg;
}

describe('Registry performance filtering', () => {
  it('registerAgent stores performance data', () => {
    const reg = makeRegistry();
    expect(reg.agents['high-scorer'].performance.composite).toBe(0.87);
    expect(reg.agents['no-perf'].performance).toBeUndefined();
  });

  it('searchAgents filters by minScore', () => {
    const reg = makeRegistry();
    const results = searchAgents(reg, '', { minScore: 0.8 });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('high-scorer');
  });

  it('searchAgents sorts by composite', () => {
    const reg = makeRegistry();
    const results = searchAgents(reg, '', { sortBy: 'composite' });
    expect(results[0].name).toBe('high-scorer');
    expect(results[1].name).toBe('mid-scorer');
    expect(results[2].name).toBe('no-perf');
  });

  it('searchAgents sorts by quality', () => {
    const reg = makeRegistry();
    const results = searchAgents(reg, '', { sortBy: 'quality' });
    expect(results[0].name).toBe('high-scorer');
  });

  it('listAllAgents filters and sorts', () => {
    const reg = makeRegistry();
    const all = listAllAgents(reg, { sortBy: 'composite' });
    expect(all[0].name).toBe('high-scorer');

    const filtered = listAllAgents(reg, { minScore: 0.5 });
    expect(filtered).toHaveLength(2);
  });

  it('listAllAgents defaults to alphabetical when no sortBy', () => {
    const reg = makeRegistry();
    const all = listAllAgents(reg);
    expect(all[0].name).toBe('high-scorer');
    expect(all[1].name).toBe('mid-scorer');
    expect(all[2].name).toBe('no-perf');
  });
});
