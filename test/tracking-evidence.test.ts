import { expect, it } from 'vitest';
import { researchFixture, researchNow as now } from './helpers/research';
import { momentumThesis } from './helpers/tracking';
import { ResearchPublisher } from '../src/research/publisher';
import { ResearchTools } from '../src/research/tools';
import { Tracking } from '../src/tracking/store';
import { TrackingRuntime } from '../src/tracking/runtime';

it('versions a new sourced event, deduplicates repeated stories and keeps an expired assessment stale after a no-change check', async () => {
  const first = await researchFixture('tracking:evidence-start');
  const p = new ResearchPublisher(first.foundation,() => now);
  await p.begin(first.lease,first.snapshotId,{ cutoff: now+1000, expiresAt: now+86400000 });
  const initial = await p.publish(first.lease,first.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'assessed', proposal: momentumThesis })));
  let at = now;
  const tracking = new Tracking(first.foundation,() => at);
  await tracking.command('investor',{ action: 'select', securityId: 'A', expectedRevision: 0, key: 'evidence-A', versionId: initial.decisions[0]!.versionId! });
  await first.foundation.release(first.lease,now);
  let materialVersion = '';
  for (const [date,key] of [['2026-11-04','new'],['2026-11-05','copy'],['2026-11-06','paraphrase']] as const) {
    const f = await researchFixture(`tracking:evidence-${key}`,date); at = Date.parse(`${date}T06:30:00Z`);
    try {
      const tools = new ResearchTools(f.foundation,f.lease,{ secUserAgent: 'research contact@example.com' },() => at,
        async () => new Response(key==='paraphrase' ? 'Guidance for earnings was raised.' : 'Earnings guidance increased.',{ headers: { 'Content-Type': 'text/plain' } }));
      const sourceId = await tools.register({ securityId: 'A', url: `https://www.sec.gov/Archives/edgar/data/1/00000000012600000${key==='new' ? '1' : key==='copy' ? '2' : '3'}/event.txt`,
        eventKey: 'verified-earnings-event', publishedAt: at-1000, revisionOf: null });
      const read = await tools.dispatch('A',`evidence:${key}`,{ kind: 'read', sourceId },at+10000);
      if (read.kind!=='evidence') throw new Error('fixture missing evidence');
      const publisher = new ResearchPublisher(f.foundation,() => at);
      await publisher.begin(f.lease,f.snapshotId,{ cutoff: at+60000, expiresAt: at+86400000 });
      await publisher.publish(f.lease,f.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'assessed', proposal: securityId==='A' ? { ...momentumThesis, facts: [{ evidenceId: read.evidence.id, quote: read.evidence.text, role: 'context' }] } : momentumThesis })));
      const runtime = new TrackingRuntime(tracking,tools,null,[],() => at);
      for (let i=0;i<15 && !await runtime.step(f.lease,f.snapshotId,at+10000);i++) {}
      const check = (await tracking.checks('A'))[0]!;
      if (key==='new') {
        expect(check.status).toBe('material_change'); expect(check.material.some(m => m.startsWith('evidence_event:'))).toBe(true);
        materialVersion = check.versionId; expect(materialVersion).not.toBe(initial.decisions[0]!.versionId);
        expect((await tracking.version(materialVersion))!.thesis).toEqual(initial.decisions[0]!.assessment!.thesis);
        await expect(f.foundation.db.prepare("DELETE FROM tracking_versions WHERE id=?").bind(materialVersion).run()).rejects.toThrow('immutable');
      } else {
        expect(check.status).toBe('no_material_change'); expect(check.material).toEqual([]); expect(check.versionId).toBe(materialVersion);
        expect((await tracking.version(materialVersion))!.expiresAt).toBeLessThanOrEqual(at);
      }
      expect((await p.publication(first.snapshotId))!.main).toEqual(['A','B','C']);
    } finally { await f.foundation.release(f.lease,at); }
  }
});
