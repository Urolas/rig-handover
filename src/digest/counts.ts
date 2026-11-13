// Plan morning-digest § 2c. Counts run lines per status for one night; bad lines are not counted.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './read.js';

export type NightCounts = { ok: number; retry: number; fail: number };

export function countLines(text: string): NightCounts {
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const run = parseLine(line);
    if (run !== null) counts[run.status] += 1;
  }
  return counts;
}

export function countNight(runsDir: string, night: string): NightCounts {
  try {
    return countLines(readFileSync(join(runsDir, `${night}.jsonl`), 'utf8'));
  } catch {
    return { ok: 0, retry: 0, fail: 0 };
  }
}
