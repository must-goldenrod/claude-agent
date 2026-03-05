import { describe, it, expect, afterEach } from 'vitest';
import { writeTimingStart, readTimingStart, cleanupTiming } from '../src/timing.js';

describe('Pre-agent timing', () => {
  const testPid = 'test-99999';

  afterEach(() => { cleanupTiming(testPid); });

  it('writes and reads timing start', () => {
    const now = Date.now();
    writeTimingStart(testPid, { startTime: now, callOrder: 1 });
    const data = readTimingStart(testPid);
    expect(data.startTime).toBe(now);
    expect(data.callOrder).toBe(1);
  });

  it('increments call order on subsequent writes', () => {
    writeTimingStart(testPid, { startTime: 1000, callOrder: 1 });
    writeTimingStart(testPid, { startTime: 2000, callOrder: 2 });
    const data = readTimingStart(testPid);
    expect(data.callOrder).toBe(2);
  });

  it('returns null when no timing file exists', () => {
    const data = readTimingStart('nonexistent-pid');
    expect(data).toBeNull();
  });

  it('cleanup removes the file', () => {
    writeTimingStart(testPid, { startTime: 1000, callOrder: 1 });
    cleanupTiming(testPid);
    expect(readTimingStart(testPid)).toBeNull();
  });
});
