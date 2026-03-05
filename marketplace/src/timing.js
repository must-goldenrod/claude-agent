import fs from 'fs';
import path from 'path';
import os from 'os';

function timingPath(pid) {
  return path.join(os.tmpdir(), `agent-timing-${pid}.json`);
}

export function writeTimingStart(pid, data) {
  fs.writeFileSync(timingPath(pid), JSON.stringify(data));
}

export function readTimingStart(pid) {
  const p = timingPath(pid);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function cleanupTiming(pid) {
  const p = timingPath(pid);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
