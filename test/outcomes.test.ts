import { expect, it } from 'vitest';
import { calculateOutcome, type OutcomeInputs } from '../src/outcomes/calculate';

const sessions = Array.from({ length: 31 },(_,i) => ({ date: `2026-12-${String(i+1).padStart(2,'0')}`, closeAt: (i+1)*1000, deadline: (i+2)*1000 }));
function inputs(): OutcomeInputs {
  return { securityId: 'A', entrySession: sessions[0]!.date, sessions, horizon: 20, now: 40000,
    reference: { price: '100', id: 'Q', acquiredAt: 1000 }, actionsThrough: sessions[29]!.date,
    actions: [], closes: sessions.slice(0,30).map((s,i) => ({ id: `close-${i}`, securityId: 'A', session: s.date, price: i===3 ? '94' : '110', acquiredAt: s.closeAt })) };
}
it('uses session S as one, raw endpoint wealth, identical costs and daily-close downside', () => {
  const result = calculateOutcome(inputs());
  expect(result).toMatchObject({ status: 'resolved', endpoint: '2026-12-20', gross: '0.100000000000', adjusted: '0.097802197802',
    sensitivity25: '0.094513715711', downside: { status: 'complete', observed: 20, expected: 20, value: '-0.060000000000' } });
});
it('keeps immature horizons pending and a missing endpoint unresolved without shifting', () => {
  const input = inputs(); input.now = 19000;
  expect(calculateOutcome(input)).toMatchObject({ status: 'pending', adjusted: null });
  input.now = 40000; input.closes = input.closes.filter(p => p.session!=='2026-12-20');
  expect(calculateOutcome(input)).toMatchObject({ status: 'unresolved', reason: 'missing_endpoint', adjusted: null, downside: { status: 'partial', observed: 19 } });
  input.closes.push({id:'invalid-zero-close',securityId:'A',session:'2026-12-20',price:'0',acquiredAt:20000});
  expect(calculateOutcome(input)).toMatchObject({status:'unresolved',reason:'missing_endpoint',gross:null});
  input.reference={price:'0',id:'invalid-zero-reference',acquiredAt:1000};
  expect(calculateOutcome(input)).toMatchObject({status:'unresolved',reason:'missing_reference',gross:null});
});
it('retains endpoint returns with an explicitly partial missing-middle path', () => {
  const input = inputs(); input.closes = input.closes.filter(p => p.session!=='2026-12-05');
  expect(calculateOutcome(input)).toMatchObject({ status: 'resolved', gross: '0.100000000000', downside: { status: 'partial', observed: 19, value: '-0.060000000000' } });
});
it('does not double-adjust an entry-session split and accrues a dividend before a later split', () => {
  const input = inputs(); input.closes = input.closes.map(p => ({ ...p, price: p.session>='2026-12-04' ? '55' : '100' }));
  input.actions = [
    { id: 'already-in-open', securityId: 'A', session: '2026-12-01', acquiredAt: 1000, order: 0, kind: 'split', ratio: '2' },
    { id: 'no-entry-dividend', securityId: 'A', session: '2026-12-01', acquiredAt: 1000, order: 1, kind: 'dividend', cash: '7' },
    { id: 'dividend', securityId: 'A', session: '2026-12-03', acquiredAt: 3000, order: 0, kind: 'dividend', cash: '1' },
    { id: 'split', securityId: 'A', session: '2026-12-04', acquiredAt: 4000, order: 0, kind: 'split', ratio: '2' },
  ];
  expect(calculateOutcome(input)).toMatchObject({ status: 'resolved', gross: '0.110000000000' });
});
it('values verified cash and mixed mergers while leaving unknown delistings unresolved', () => {
  const input = inputs();
  input.actions = [{ id: 'cash-merger', securityId: 'A', session: '2026-12-06', acquiredAt: 6000, order: 0, kind: 'conversion', cash: '105', successors: [] }];
  input.closes = input.closes.filter(p => p.session<'2026-12-06');
  expect(calculateOutcome(input)).toMatchObject({ status: 'resolved', gross: '0.050000000000', downside: { status: 'complete', observed: 20 } });
  input.actions = [{ ...input.actions[0]!, kind: 'conversion', cash: '5', successors: [{ securityId: 'B', ratio: '2' }] }];
  input.closes.push(...sessions.slice(5,20).map(s => ({ id: `B-${s.date}`, securityId: 'B', session: s.date, price: '50', acquiredAt: s.closeAt })));
  expect(calculateOutcome(input)).toMatchObject({ status: 'resolved', gross: '0.050000000000' });
  input.actions = [{ id: 'unknown', securityId: 'A', session: '2026-12-06', acquiredAt: 6000, order: 0, kind: 'unresolved' }];
  expect(calculateOutcome(input)).toMatchObject({ status: 'unresolved', reason: 'unresolved_action', gross: null });
});
it('never uses observations or verified actions acquired after the calculation cutoff', () => {
  const input = inputs(); input.closes = input.closes.map(p => p.session==='2026-12-20' ? {...p,acquiredAt:50000} : p);
  expect(calculateOutcome(input)).toMatchObject({status:'unresolved',reason:'missing_endpoint'});
});
it('applies a verified weekend conversion before the next trading close', () => {
  const input = inputs(); input.sessions = input.sessions.filter(s => s.date!=='2026-12-06');
  input.actions = [{id:'weekend-cash',securityId:'A',session:'2026-12-06',acquiredAt:6000,order:0,kind:'conversion',cash:'105',successors:[]}];
  input.closes = input.closes.filter(p => p.session<'2026-12-06');
  expect(calculateOutcome(input)).toMatchObject({status:'resolved',gross:'0.050000000000'});
});
it('requires explicit ordering for same-day entitlements and keeps missing successor prices unresolved', () => {
  const input = inputs();
  input.actions = [
    {id:'split-same-day',securityId:'A',session:'2026-12-04',acquiredAt:4000,order:0,kind:'split',ratio:'2'},
    {id:'dividend-same-day',securityId:'A',session:'2026-12-04',acquiredAt:4000,order:0,kind:'dividend',cash:'1'},
  ];
  expect(calculateOutcome(input)).toMatchObject({status:'unresolved',reason:'unresolved_action'});
  input.actions = [{id:'spinoff',securityId:'A',session:'2026-12-04',acquiredAt:4000,order:0,kind:'spinoff',successors:[{securityId:'B',ratio:'1'}]}];
  expect(calculateOutcome(input)).toMatchObject({status:'unresolved',reason:'unresolved_action'});
  input.actions = [
    {id:'parent-conversion',securityId:'A',session:'2026-12-04',acquiredAt:4000,order:0,kind:'conversion',cash:'0',successors:[{securityId:'B',ratio:'1'}]},
    {id:'successor-dividend',securityId:'B',session:'2026-12-04',acquiredAt:4000,order:0,kind:'dividend',cash:'1'},
  ];
  expect(calculateOutcome(input)).toMatchObject({status:'unresolved',reason:'unresolved_action'});
});

it('ignores actions on disposed predecessors when ordering held-successor entitlements', () => {
  const input=inputs();
  input.actions=[
    {id:'A-B',securityId:'A',session:'2026-12-05',acquiredAt:5000,order:0,kind:'conversion',cash:'0',successors:[{securityId:'B',ratio:'1'}]},
    {id:'B-C',securityId:'B',session:'2026-12-10',acquiredAt:10000,order:0,kind:'conversion',cash:'0',successors:[{securityId:'C',ratio:'1'}]},
    {id:'disposed-B-dividend',securityId:'B',session:'2026-12-15',acquiredAt:15000,order:0,kind:'dividend',cash:'9'},
    {id:'held-C-dividend',securityId:'C',session:'2026-12-15',acquiredAt:15000,order:0,kind:'dividend',cash:'1'},
  ];
  input.closes=sessions.slice(0,20).map(s=>({id:s.date,session:s.date,acquiredAt:s.closeAt,securityId:s.date<'2026-12-05' ? 'A' : s.date<'2026-12-10' ? 'B' : 'C',price:'110'}));
  expect(calculateOutcome(input)).toMatchObject({status:'resolved',gross:'0.110000000000'});
});
