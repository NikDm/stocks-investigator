import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { Foundation, type Input, type Item } from '../src/persistence';

it('partitions all 5078 securities and 90 sessions within bounded SQL pages without dropping records', async () => {
  const store = new Foundation(env.DB), now = Date.now();
  const run = await store.enqueue('synthetic:representative-load', { pages: 102 }, now);
  let lease = (await store.claim(run.id, 'load', now))!;
  let maximumStageMs = 0;
  const started = Date.now();
  let page: Input[] = [], batches = 0;
  for (let security = 0; security < 5078; security++) {
    for (let session = 0; session < 90; session++) {
      page.push({ id: `${security}:${session}`, securityId: `S${security}`, kind: 'daily', source: 'synthetic',
        asOf: session, acquiredAt: now, revisionOf: null, value: { close: '12.50', volume: '100000', basis: 'raw' } });
      if (page.length === 500 || security === 5077 && session === 89) {
        const stageStart = Date.now();
        await store.capture(lease, page, now);
        maximumStageMs = Math.max(maximumStageMs, Date.now() - stageStart);
        page = []; batches++;
        // Model separate checkpoint windows: the harness is not a hosted Cron benchmark.
        if (batches % 64 === 0) {
          await store.release(lease, now);
          lease = (await store.claim(run.id, 'load', now))!;
        }
      }
    }
  }
  for (let offset = 0, index = 0; offset < 5078; offset += 50, index++) {
    const items: Item[] = Array.from({ length: Math.min(50, 5078 - offset) }, (_, n) => ({
      id: `S${offset + n}`, kind: 'universe', acquiredAt: now, value: { eligible: true },
    }));
    await store.stage(lease, index, items, now);
  }
  await store.publish(lease, { id: 'load-report', cutoff: now, expectedPages: 102 }, now);
  await store.certify(lease, 'load-report', () => now);
  expect((await store.metrics()).inputRows).toBe(457020);
  expect((await store.report('load-report'))?.itemCount).toBe(5078);
  expect(await store.inputs('S5077')).toHaveLength(90);
  expect(maximumStageMs).toBeLessThan(45000);
  console.info(JSON.stringify({ benchmark: 'local-synthetic', rows: 457020, securities: 5078, batches,
    maximumStageMs, elapsedMs: Date.now() - started, ...(await store.metrics()) }));
}, 180000);
