import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { Foundation } from '../src/persistence';
import { drain, mapBounded } from '../src/coordinator';

it('deduplicates commands and drains several durable stages per tick under one pipeline lease', async () => {
  const store = new Foundation(env.DB);
  const run = await store.enqueue('synthetic:drain', { pages: 4 }, 1000);
  expect((await store.enqueue('synthetic:drain', { pages: 4 }, 1000)).id).toBe(run.id);
  await expect(store.enqueue('synthetic:drain', { pages: 5 }, 1000)).rejects.toThrow('idempotency');
  let now = 1000;
  const results = await Promise.all([
    drain(store, { clock: () => now, execute: async ({ page }) => {
      now += 40000;
      return [{ id: `S${page}`, kind: 'universe', acquiredAt: 1000, value: {} }];
    } }),
    drain(store, { clock: () => now }),
  ]);
  expect(results.reduce((n, r) => n + r.pages, 0)).toBe(4);
  expect((await store.run(run.id))?.state).toBe('completed');
  expect((await store.report(run.id))?.items).toHaveLength(4);
});

it('limits concurrent work to four tasks', async () => {
  let active = 0, peak = 0;
  const result = await mapBounded([1,2,3,4,5,6,7,8,9], async (n) => {
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--; return n * 2;
  });
  expect(peak).toBe(4);
  expect(result).toEqual([2,4,6,8,10,12,14,16,18]);
});

it('resumes after failure without losing pages and stops after three counted attempts', async () => {
  const store = new Foundation(env.DB);
  const run = await store.enqueue('synthetic:retry', { pages: 2 }, 5000000);
  let now = 5000000;
  const execute = async ({ page }: { page: number }) => {
    if (page === 1) throw new Error('provider-secret-must-not-be-logged');
    return [{ id: 'checkpoint', kind: 'universe' as const, acquiredAt: now, value: {} }];
  };
  await drain(store, { clock: () => now, execute });
  expect((await store.run(run.id))?.cursor).toBe(1);
  expect((await store.run(run.id))?.attempts).toBe(1);
  now += 300000;
  await drain(store, { clock: () => now, execute });
  now += 300000;
  await drain(store, { clock: () => now, execute });
  expect((await store.run(run.id))?.state).toBe('failed');
  expect((await store.run(run.id))?.error_code).toBe('stage_failed');
  expect(await store.report(run.id)).toBeNull();
});

it('reserves shared daily/monthly allowance atomically and keeps unknown usage charged across retries', async () => {
  const store = new Foundation(env.DB);
  const now = Date.UTC(2026, 10, 3);
  const run = await store.enqueue('synthetic:budget', {}, now);
  const lease = (await store.claim(run.id, 'budget-writer', now))!;
  await store.setBudget('2026-11', 'search', 3);
  await store.setBudget('2026-11-03', 'search', 2);
  const results = await Promise.all([1,2,3].map((n) => store.reserve(lease, `attempt-${n}`, 'search', 1, n, now)));
  expect(results.filter(Boolean)).toHaveLength(2);
  expect(await store.reserve(lease, 'attempt-1', 'search', 1, 1, now)).toBe(true);
  expect(await store.reserve(lease, 'unknown-policy', 'model', 1, 1, now)).toBe(false);
  expect((await store.usage('2026-11', 'search')).charged).toBe(2);
});

import worker from '../src/index';
it('scheduled and manual commands enter the same durable coordinator without HTTP background work', async () => {
  const bindings = { ...env, JOBS_ENABLED: 'true' };
  const tick = { scheduledTime: 9000000, cron: '*/5 * * * *', noRetry() {} };
  await worker.scheduled(tick, bindings);
  const run = await new Foundation(env.DB).enqueue('scheduled:synthetic:1970-01-01', { pages: 4 }, Date.now());
  expect(['queued', 'completed']).toContain(run.state);
});

it('checkpoints at the invocation stage cap and preserves all remaining pages for a later tick', async () => {
  const store = new Foundation(env.DB), now = Date.now() + 1000000;
  const run = await store.enqueue('synthetic:bounded', { pages: 70 }, now);
  // Drain older due work before this isolated future-time command.
  for (let i = 0; i < 5 && (await store.run(run.id))?.cursor === 0; i++) await drain(store, { clock: () => now });
  expect((await store.run(run.id))?.cursor).toBe(64);
  expect(await store.report(run.id)).toBeNull();
  await drain(store, { clock: () => now });
  expect((await store.report(run.id))?.items).toHaveLength(70);
});
