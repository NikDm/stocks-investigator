import { expect, it } from 'vitest';
import { authenticated } from './auth';
import { createApp } from '../src/http';

it('records date-precision actual entries and retains corrections and removal without creating tracking', async () => {
  let now = Date.parse('2026-11-04T10:00:00Z');
  const { request } = await authenticated(() => now);
  const { token } = await (await request('/api/csrf')).json() as { token: string };
  const headers = { origin: 'https://research.example', 'content-type': 'application/json', 'x-csrf-token': token };
  const send = (body: unknown) => request('/api/purchases',{ method: 'POST', headers, body: JSON.stringify(body) });
  const command = { action: 'record', purchaseId: 'purchase-one', securityId: 'stable-security', purchaseDate: '2026-11-03', entryPriceUsd: '12.34', expectedRevision: 0, key: 'purchase-record' };
  expect((await send(command)).status).toBe(201);
  const initial = await (await send(command)).json();
  expect(initial).toMatchObject({ revision: 1, precision: 'date', purchaseDate: '2026-11-03', entryPriceUsd: '12.34', acquiredAt: now, originalAcquiredAt: now, status: 'recorded' });
  now += 1000;
  expect((await send({ ...command, key: 'changed', entryPriceUsd: '13' })).status).toBe(409);
  const correction = { ...command, action: 'correct', key: 'correct', expectedRevision: 1, entryPriceUsd: '13', note: 'Price correction' };
  expect((await send(correction)).status).toBe(201);
  expect((await send({ action: 'remove', purchaseId: command.purchaseId, expectedRevision: 2, key: 'remove' })).status).toBe(201);
  expect(await (await send(command)).json()).toEqual(initial);
  const history = await (await request('/api/purchases/purchase-one')).json() as { history: unknown[] };
  expect(history.history).toHaveLength(3);
  expect(history.history[1]).toMatchObject({ revision: 2, entryPriceUsd: '13', originalAcquiredAt: now-1000, originalRecordId: 'purchase-one' });
  expect(history.history[2]).toMatchObject({ revision: 3, status: 'removed', entryPriceUsd: '13' });
  expect(await (await request('/tracking')).text()).toContain('0/10 occupied slots');
  expect((await send({ ...correction, expectedRevision: 3, key: 'resurrect' })).status).toBe(409);
});

it('rejects unauthorized, forged, invalid and conflicting purchase commands', async () => {
  const { request } = await authenticated(() => Date.parse('2026-11-04T12:00:00Z'));
  const { token } = await (await request('/api/csrf')).json() as { token: string };
  const headers = { origin: 'https://research.example', 'content-type': 'application/json', 'x-csrf-token': token };
  const command = { action: 'record', purchaseId: 'validated', securityId: 'stable', purchaseDate: '2026-11-03', entryPriceUsd: '1.01', expectedRevision: 0, key: 'validated' };
  const send = (body: unknown, overrides = {}) => request('/api/purchases',{ method: 'POST', headers: { ...headers, ...overrides }, body: JSON.stringify(body) });
  expect((await createApp().request('https://research.example/api/purchases', { method: 'POST' }, {})).status).toBe(401);
  expect((await send(command, { origin: 'https://attacker.example' })).status).toBe(403);
  expect((await send(command, { 'x-csrf-token': '' })).status).toBe(403);
  for (const invalid of [{ entryPriceUsd: '0' },{ entryPriceUsd: '-1' },{ entryPriceUsd: 'NaN' },{ purchaseDate: '2026-02-30' },{ quantity: 1 },{ securityId: '' },{ note: 'a'.repeat(501) }]) {
    expect((await send({ ...command, ...invalid })).status).toBe(400);
  }
  expect((await send({ ...command, purchaseDate: '2026-11-05' })).status).toBe(409);
  expect((await send({ ...command, opportunityId: 'stable' })).status).toBe(409);
  expect((await send(command)).status).toBe(201);
  expect((await send({ ...command, entryPriceUsd: '2' })).status).toBe(409);
  const results = await Promise.all(['first','second'].map(key => send({ ...command, action: 'correct', expectedRevision: 1, key, entryPriceUsd: '2' })));
  expect(results.map(r => r.status).sort()).toEqual([201,409]);
  expect((await send({ ...command, action: 'correct', expectedRevision: 2, key: 'change-security', securityId: 'different' })).status).toBe(409);
  expect((await request('/api/purchases/validated?after=-1')).status).toBe(400);
});

it('keeps selection, frozen research and hypothetical outcomes independent of linked actual purchases', async () => {
  const { researchFixture, researchNow } = await import('./helpers/research');
  const { ResearchPublisher } = await import('../src/research/publisher');
  const { momentumThesis } = await import('./helpers/tracking');
  const { planEvaluation } = await import('../src/market/evaluation');
  const f = await researchFixture('purchase-isolation');
  try {
    const publisher = new ResearchPublisher(f.foundation,() => researchNow);
    await publisher.begin(f.lease,f.snapshotId,{ cutoff: researchNow+1000, expiresAt: researchNow+86400000 });
    const p = await publisher.publish(f.lease,f.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'assessed', proposal: momentumThesis })));
    await planEvaluation(f.capture,f.lease,f.snapshotId,'2026-11-02');
    const { request } = await authenticated(() => researchNow);
    const { token } = await (await request('/api/csrf')).json() as { token: string };
    const headers = { origin: 'https://research.example', 'content-type': 'application/json', 'x-csrf-token': token };
    const post = (path: string, body: unknown) => request(path,{ method: 'POST', headers, body: JSON.stringify(body) });
    const purchasesBefore = await (await request('/api/purchases')).json();
    expect((await post('/api/tracking',{ action: 'select', securityId: 'A', expectedRevision: 0, key: 'purchase-select', versionId: p.decisions[0]!.versionId! })).status).toBe(201);
    expect(await (await request('/api/purchases')).json()).toEqual(purchasesBefore);
    const paths = [`/api/market/snapshots/${f.snapshotId}`,`/api/outcomes/${f.snapshotId}`,'/tracking/A'];
    const before = await Promise.all(paths.map(async path => (await request(path)).text()));
    const command = { action: 'record', purchaseId: 'linked', securityId: 'A', opportunityId: 'A', purchaseDate: '2026-11-02', entryPriceUsd: '100', expectedRevision: 0, key: 'linked' };
    expect((await post('/api/purchases',command)).status).toBe(201);
    expect((await post('/api/purchases',{ ...command, action: 'correct', entryPriceUsd: '101', expectedRevision: 1, key: 'linked-correction' })).status).toBe(201);
    expect((await post('/api/purchases',{ action: 'remove', purchaseId: 'linked', expectedRevision: 2, key: 'linked-remove' })).status).toBe(201);
    const after = await Promise.all(paths.map(async path => (await request(path)).text()));
    // Tracking forms contain fresh idempotency keys on each render.
    expect(after.map(s => s.replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/g,'KEY'))).toEqual(before.map(s => s.replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/g,'KEY')));
  } finally { await f.foundation.release(f.lease,researchNow); }
});
