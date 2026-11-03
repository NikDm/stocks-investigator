import { expect, it } from 'vitest';
import { researchFixture, researchNow as now } from './helpers/research';
import { momentumThesis } from './helpers/tracking';
import { ResearchPublisher } from '../src/research/publisher';
import { authenticated } from './auth';
import { createApp } from '../src/http';

it('protects tracking commands and shows occupied slots, explicit archive and immutable history in the private dashboard', async () => {
  const f = await researchFixture('tracking:http');
  try {
    const publisher = new ResearchPublisher(f.foundation,() => now);
    await publisher.begin(f.lease,f.snapshotId,{ cutoff: now+1000, expiresAt: now+86400000 });
    const p = await publisher.publish(f.lease,f.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'assessed', proposal: momentumThesis })));
    const { request } = await authenticated(() => now);
    const csrf = await (await request('/api/csrf')).json() as { token: string };
    const command = { action: 'select', securityId: 'A', expectedRevision: 0, key: 'http-A', versionId: p.decisions[0]!.versionId! };
    const headers = { origin: 'https://research.example', 'content-type': 'application/json', 'x-csrf-token': csrf.token };
    expect((await request('/api/tracking',{ method: 'POST', headers: { ...headers,'x-csrf-token': '' }, body: JSON.stringify(command) })).status).toBe(403);
    expect((await request('/api/tracking',{ method: 'POST', headers, body: JSON.stringify(command) })).status).toBe(201);
    expect(await (await request('/tracking')).text()).toContain('1/10 occupied slots');
    let html = await (await request('/tracking/A')).text();
    expect(html).toContain('Tracking does not imply ownership'); expect(html).toContain('Archive opportunity');
    const form = new URLSearchParams({ csrf: csrf.token, action: 'archive', securityId: 'A', expectedRevision: '1', key: 'http-archive' });
    expect((await request('/tracking/commands',{ method: 'POST', headers: { origin: headers.origin, 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() })).status).toBe(303);
    html = await (await request('/tracking/A')).text();
    expect(html).toContain('archived'); expect(html).toContain('Lifecycle history'); expect(html).toContain(p.decisions[0]!.versionId!);
    expect(await (await request('/tracking')).text()).toContain('0/10 occupied slots');
    expect((await createApp().request('https://research.example/tracking',{},{})).status).toBe(401);
    expect((await request('/api/tracking',{ method: 'POST', headers, body: JSON.stringify({ ...command, key: 'stale' }) })).status).toBe(409);
  } finally { await f.foundation.release(f.lease,now); }
});
