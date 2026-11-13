import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

function tempRuns(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

describe('readNight', () => {
  it('reads runs/2026-10-28.jsonl into one row per job', () => {
    const n = readNight('runs', '2026-10-28');
    expect(n).not.toBeNull();
    if (n === null) return;
    expect(n.night).toBe('2026-10-28');
    expect(n.badLines).toBe(1);
    expect(n.rows).toHaveLength(5);
    const jobs = n.rows.map((r) => r.job);
    expect(jobs).toEqual([...jobs].sort());

    const refresh = n.rows.find((r) => r.job === 'fixtures/refresh');
    expect(refresh).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503', owner: 'rook' });
    expect(refresh?.first).toBe('2026-10-29T01:30:00+01:00');
    expect(refresh?.last).toBe('2026-10-29T01:37:00+01:00');

    const backup = n.rows.find((r) => r.job === 'notes/backup');
    expect(backup).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });

    const render = n.rows.find((r) => r.job === 'digest/render');
    expect(render).toBeDefined();
    expect(render?.owner).toBeNull();
  });

  it('returns null for a night with no file', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    expect(readNight('runs', '../package')).toBeNull();
    expect(readNight('runs', '2026-10-28.jsonl')).toBeNull();
    expect(readNight('runs', '')).toBeNull();
  });

  it('reads an empty file as nothing ran', () => {
    const dir = tempRuns({ '2026-01-01.jsonl': '' });
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('counts bad and invalid lines, skips blank ones, keeps the rest', () => {
    const lines = [
      '{"at":"2026-01-02T01:00:00+01:00","job":"b","status":"retry","owner":null,"error":"x"}',
      '',
      '{not json',
      '{"at":"2026-01-02T01:05:00+01:00","job":"b","status":"maybe","owner":null}',
      '{"at":"2026-01-02T01:06:00+01:00","job":"","status":"ok","owner":null}',
      '{"at":"2026-01-02T01:07:00+01:00","job":"a","status":"ok","owner":5}',
      '[1,2]',
      '   ',
      '{"at":"2026-01-02T01:10:00+01:00","job":"b","status":"ok","owner":"rook"}',
      '{"at":"2026-01-02T02:00:00-05:00","job":"a","status":"ok","owner":"lane-07"}',
      '',
    ];
    const dir = tempRuns({ '2026-01-02.jsonl': lines.join('\n') });
    const n = readNight(dir, '2026-01-02');
    expect(n?.badLines).toBe(5);
    expect(n?.rows).toEqual([
      { job: 'a', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok', lastError: null, first: '2026-01-02T02:00:00-05:00', last: '2026-01-02T02:00:00-05:00' },
      { job: 'b', owner: 'rook', runs: 2, retries: 1, lastStatus: 'ok', lastError: 'x', first: '2026-01-02T01:00:00+01:00', last: '2026-01-02T01:10:00+01:00' },
    ]);
  });
});
