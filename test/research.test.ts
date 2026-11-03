import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { Foundation } from '../src/persistence';
import { ResearchLedger } from '../src/research/ledger';

const now = Date.parse('2026-11-03T06:30:00Z');
it('reserves shared search attempts before dispatch and retains unknown billed calls across restarts', async () => {
  const foundation = new Foundation(env.DB);
  const run = await foundation.enqueue('research:budgets',{},now);
  const lease = (await foundation.claim(run.id,'research',now))!;
  try {
    const ledger = new ResearchLedger(foundation,lease,() => now);
    for (let i=0;i<30;i++) await ledger.reserve('search',`pass-${i}`);
    await expect(new ResearchLedger(foundation,lease,() => now).reserve('search','refresh')).rejects.toThrow('budget');
    expect((await ledger.usage('day','search')).reserved).toBe(30);
    expect((await ledger.usage('month','search')).reserved).toBe(30);
  } finally { await foundation.release(lease,now); }
});

it('counts repairs and repeated contexts within the security pass and atomically rejects overspend', async () => {
  const foundation = new Foundation(env.DB), run = await foundation.enqueue('research:model-bounds',{},now);
  const lease = (await foundation.claim(run.id,'research',now))!;
  try {
    const ledger = new ResearchLedger(foundation,lease,() => now);
    const first = await ledger.reserve('model','security-A',{ input: 7000, output: 600 });
    await ledger.settleModel(first,{ input: 6000, output: 500 });
    await ledger.reserve('model','security-A',{ input: 6000, output: 700 });
    await expect(ledger.reserve('model','security-A',{ input: 1, output: 1 })).rejects.toThrow('budget');
    expect((await ledger.usage('pass','turn','security-A')).reserved).toBe(2);
    expect((await ledger.usage('pass','input','security-A')).reserved).toBe(12000);
    await expect(ledger.settleModel(first,{ input: 1, output: 1 })).rejects.toThrow();
  } finally { await foundation.release(lease,now); }
});

it('serializes competing requests for the last shared allowance without partial charges', async () => {
  const at = now+86400000, foundation = new Foundation(env.DB), run = await foundation.enqueue('research:concurrent',{},at);
  const lease = (await foundation.claim(run.id,'research',at))!;
  try {
    const ledger = new ResearchLedger(foundation,lease,() => at);
    for (let i=0;i<29;i++) await ledger.reserve('search',`concurrent:${i}`);
    const results = await Promise.allSettled([ledger.reserve('search','concurrent:a'),ledger.reserve('search','concurrent:b')]);
    expect(results.filter(r => r.status==='fulfilled')).toHaveLength(1);
    expect((await ledger.usage('day','search')).reserved).toBe(30);
    const monthCalls = (await ledger.usage('month','search')).reserved;
    expect((await ledger.usage('month','search_microdollars')).reserved).toBe(monthCalls*5000);
  } finally { await foundation.release(lease,at); }
});
