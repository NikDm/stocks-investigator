import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { Foundation } from '../src/persistence';

it('keeps staged records private until a complete report and cohort publish atomically', async () => {
  const store = new Foundation(env.DB);
  const run = await store.enqueue('synthetic:publication', { pages: 2 }, 1000);
  const lease = await store.claim(run.id, 'worker-a', 1000);
  expect(lease).not.toBeNull();
  await store.stage(lease!, 0, [{ id: 'S1', kind: 'universe', acquiredAt: 1000, value: { symbol: '<script>alert(1)</script>' } }], 1001);
  expect(await store.reports()).toEqual([]);
  await expect(store.publish(lease!, { id: 'report-1', cutoff: 2000, expectedPages: 2 }, 2000)).rejects.toThrow();
  expect(await store.reports()).toEqual([]);
  await store.stage(lease!, 1, [{ id: 'C1', kind: 'cohort', acquiredAt: 1000, value: { security: 'S1', group: 'baseline' } }], 2001);
  await store.publish(lease!, { id: 'report-1', cutoff: 2000, expectedPages: 2 }, 2002);
  expect((await store.report('report-1'))?.items).toHaveLength(2);
  expect((await store.report('report-1'))?.receipt).toBeNull();
});

it('rolls back the entire publication when any input arrived after the cutoff', async () => {
  const store = new Foundation(env.DB);
  const run = await store.enqueue('synthetic:future', {}, 1000000);
  const lease = (await store.claim(run.id, 'writer', 1000000))!;
  await store.stage(lease, 0, [
    { id: 'old', kind: 'universe', acquiredAt: 100, value: {} },
    { id: 'future', kind: 'cohort', acquiredAt: 1000002, value: {} },
  ], 1000001);
  await expect(store.publish(lease, { id: 'future-report', cutoff: 1000001, expectedPages: 1 }, 1000003)).rejects.toThrow();
  expect(await store.report('future-report')).toBeNull();
});

it('rejects stale workers and certifies availability only at a fresh primary readback time', async () => {
  const store = new Foundation(env.DB);
  const run = await store.enqueue('synthetic:fencing', {}, 2000000);
  const old = (await store.claim(run.id, 'old', 2000000))!;
  await store.stage(old, 0, [{ id: 'S', kind: 'universe', acquiredAt: 2000000, value: {} }], 2000001);
  const current = (await store.claim(run.id, 'new', 2090000))!;
  await expect(store.publish(old, { id: 'stale-report', cutoff: 2000001, expectedPages: 1 }, 2090001)).rejects.toThrow();
  await store.publish(current, { id: 'recovered', cutoff: 2000001, expectedPages: 1 }, 2090001);
  await store.certify(current, 'recovered', () => 2090002);
  expect((await store.report('recovered'))?.receipt?.observed_at).toBe(2090002);
  await expect(store.db.prepare("UPDATE artifacts SET value='{}' WHERE report_id='recovered'").run()).rejects.toThrow('immutable');
});

it('captures immutable versioned inputs without copying the history into each report', async () => {
  const store = new Foundation(env.DB);
  const run = await store.enqueue('synthetic:inputs', {}, 3000000);
  const lease = (await store.claim(run.id, 'capture', 3000000))!;
  const input = { id: 'bar-v1', securityId: 'security-1', kind: 'daily' as const,
    source: 'synthetic', asOf: 2000000, acquiredAt: 3000000, revisionOf: null,
    value: { close: '12.50', basis: 'raw' } };
  await store.capture(lease, [input], 3000000);
  await store.capture(lease, [input], 3000000);
  expect((await store.inputs('security-1')).map((row) => row.id)).toEqual(['bar-v1']);
  await expect(store.capture(lease, [{ ...input, value: { close: '99.00' } }], 3000000)).rejects.toThrow();
  await store.capture(lease, [{ ...input, id: 'bar-v2', revisionOf: 'bar-v1', value: { close: '12.60' } }], 3000000);
  expect(await store.inputs('security-1')).toHaveLength(2);
});

it('cannot publish a reference to a missing or post-cutoff versioned input', async () => {
  const store = new Foundation(env.DB);
  const run = await store.enqueue('synthetic:reference-boundary', {}, 4000000);
  const lease = (await store.claim(run.id, 'refs', 4000000))!;
  await store.stage(lease, 0, [{ id: 'ref', kind: 'snapshot_input', acquiredAt: 4000000, value: { inputId: 'missing' } }], 4000000);
  await expect(store.publish(lease, { id: 'bad-reference', cutoff: 4000000, expectedPages: 1 }, 4000000)).rejects.toThrow();
  expect(await store.report('bad-reference')).toBeNull();
});
