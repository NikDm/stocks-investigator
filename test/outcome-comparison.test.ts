import { expect, it } from 'vitest';
import { compare } from '../src/outcomes/comparison';
import { calculateOutcome, type OutcomeInputs } from '../src/outcomes/calculate';
it('counts unresolved members, uses resolved-only statistics and treats empty AI as abstention', () => {
  const sessions = Array.from({length: 11},(_,i) => ({ date: `2026-11-${String(i+1).padStart(2,'0')}`, closeAt: i, deadline: i+1 }));
  const input: OutcomeInputs = { securityId: 'A', entrySession: sessions[0]!.date, sessions, horizon: 10, now: 30, actionsThrough: sessions[9]!.date,
    reference: { id: 'Q', price: '100', acquiredAt: 0 }, actions: [], closes: sessions.map(s => ({ id: s.date, securityId: 'A', session: s.date, price: '110', acquiredAt: 0 })) };
  const a = calculateOutcome(input), b = calculateOutcome({ ...input, closes: input.closes.map(p => ({...p,price:'95'})) }), c = calculateOutcome({...input,reference:null});
  const result = compare(new Map([['A',a],['B',b],['C',c]]),['A','B','C'],['A']);
  expect(result.baseline).toMatchObject({ total: 3, resolved: 2, grossMean: '0.025000000000', reasons: { missing_reference: 1 } });
  expect(result).toMatchObject({ overlap: 1, paired: { total: 1, resolved: 1 }, abstention: false, ai: { mean: a.adjusted } });
  expect(compare(new Map([['A',a]]),['A'],[])).toMatchObject({ abstention: true, ai: { total: 0, mean: null } });
});
