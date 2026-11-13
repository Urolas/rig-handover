import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const GOOD = '2026-01-01';
const EMPTY = '2026-01-02';
const BAD = '2026-01-03';
const MISSING = '2026-01-04';

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-'));
  const line = (job: string, status: string, at: string, owner: string | null = 'ann') =>
    JSON.stringify({ at, job, status, owner });
  fs.writeFileSync(
    path.join(runsDir, `${GOOD}.jsonl`),
    [
      line('zeta-sync', 'ok', '2026-01-01T02:00:00+01:00'),
      line('alpha-backup', 'retry', '2026-01-01T02:05:00+01:00'),
      line('alpha-backup', 'ok', '2026-01-01T02:10:00+01:00'),
    ].join('\n') + '\n',
  );
  fs.writeFileSync(path.join(runsDir, `${EMPTY}.jsonl`), '');
  fs.writeFileSync(
    path.join(runsDir, `${BAD}.jsonl`),
    ['this is not json', line('only-job', 'ok', '2026-01-03T02:00:00+01:00')].join('\n') + '\n',
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

afterAll(() => {
  fs.rmSync(runsDir, { recursive: true, force: true });
});

type Body = { night: string; rows: { job: string }[]; badLines: number };

describe('GET /digest/:night', () => {
  it('renders a 200 page listing both jobs', async () => {
    const res = await app.request(`/digest/${GOOD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha-backup');
    expect(html).toContain('zeta-sync');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('renders "nothing ran" for an empty night', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders 200 for a night with a bad line', async () => {
    const res = await app.request(`/digest/${BAD}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('only-job');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns night, rows and badLines for the good night', async () => {
    const res = await app.request(`/api/digest/${GOOD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.night).toBe(GOOD);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha-backup', 'zeta-sync']);
    expect(body.rows[0]).toMatchObject({
      job: 'alpha-backup',
      owner: 'ann',
      runs: 2,
      retries: 1,
      lastStatus: 'ok',
      lastError: null,
      first: '2026-01-01T02:05:00+01:00',
      last: '2026-01-01T02:10:00+01:00',
    });
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('returns empty rows for an empty night', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts the bad line', async () => {
    const res = await app.request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['only-job']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const html = await (await app.request(`/digest/${GOOD}`)).text();
    const body = (await (await app.request(`/api/digest/${GOOD}`)).json()) as Body;
    const jobs = body.rows.map((r) => r.job);
    expect(jobs.length).toBe(2);
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // first <td> of each row, when the page uses plain <td> cells
    const firstCells = [...html.matchAll(/<tr[^>]*>\s*<td[^>]*>(.*?)<\/td>/gs)].map((m) =>
      m[1]!.replace(/<[^>]+>/g, '').trim(),
    );
    if (firstCells.length > 0) expect(firstCells).toEqual(jobs);
  });
});
