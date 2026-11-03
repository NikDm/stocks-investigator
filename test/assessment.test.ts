import { expect, it } from 'vitest';
import { validateAssessment, type Evidence } from '../src/research/assessment';

const evidence: Evidence[] = [{ id: 'filing-v1', securityId: 'A', url: 'https://www.sec.gov/Archives/edgar/data/1/000000000126000001/event.txt',
  originId: 'sec:000000000126000001', eventId: 'event-1', primary: true, publishedAt: 100, acquiredAt: 200,
  hash: 'a'.repeat(64), revisionOf: null, text: 'The contract was signed. A customer may terminate the contract.', retention: 'public_document' }];
const context = { securityId: 'A', cutoff: 300, marketAsOf: 100, expiresAt: 500, evidence,
  metrics: { sma20: '20.25', latestClose: '21.00' } };
const proposal = { outcome: 'accepted', facts: [{ evidenceId: 'filing-v1', quote: 'The contract was signed.', role: 'support' }],
  interpretations: [{ text: 'The contract may support continued attention.', evidenceIds: ['filing-v1'] }], unknowns: ['The market reaction has no verified cause.'],
  thesis: { text: 'Attention may persist while the contract remains in force.', evidenceIds: ['filing-v1'] },
  invalidation: [{ text: 'The customer terminates the contract.', evidenceIds: ['filing-v1'] }],
  horizonSessions: 20, attractiveness: 'conditional', priceCondition: 'sma20' };
it('publishes only acquired, verifiable citations and independently derived price conditions', () => {
  const result = validateAssessment(proposal,context);
  expect(result.priceCondition).toEqual({ method: 'sma20', value: '20.25', asOf: 100, currentEntryValidated: false });
  expect(result.sources).toHaveLength(1);
  expect(result.outcome).toBe('accepted');
  expect(() => validateAssessment({ ...proposal, facts: [{ evidenceId: 'missing', quote: 'invented', role: 'support' }] },context)).toThrow();
  expect(() => validateAssessment(proposal,{ ...context, cutoff: 199 })).toThrow('cutoff');
  expect(() => validateAssessment({ ...proposal, facts: [{ evidenceId: 'filing-v1', quote: 'Revenue will double.', role: 'support' }] },context)).toThrow('citation');
});

it('expires dependent conditions before the known opening or cited scheduled event and never validates a stale entry', () => {
  const beforeOpen = validateAssessment({ ...proposal, validity: { kind: 'before_open' } },{ ...context, openAt: 400 });
  expect(beforeOpen.expiresAt).toBe(400);
  expect(beforeOpen.priceCondition.currentEntryValidated).toBe(false);
  const scheduled = context.evidence.map(e => ({ ...e, scheduledEventAt: 350 }));
  expect(validateAssessment({ ...proposal, validity: { kind: 'before_event', evidenceId: 'filing-v1' } },{ ...context, evidence: scheduled }).expiresAt).toBe(350);
  expect(() => validateAssessment({ ...proposal, validity: { kind: 'before_event', evidenceId: 'missing' } },context)).toThrow();
});

it('requires known publication times for current claims and explicitly represents unexplained conditional theses', () => {
  expect(() => validateAssessment(proposal,{ ...context, evidence: evidence.map(e => ({ ...e, publishedAt: null })) })).toThrow('publication time');
  const unexplained = validateAssessment({ ...proposal, thesisKind: 'unexplained', facts: [], interpretations: [],
    thesis: { text: 'Momentum may continue while above the moving average.', evidenceIds: [], metricKeys: ['sma20'] },
    invalidation: [{ text: 'The price falls below the moving average.', evidenceIds: [], metricKeys: ['sma20'] }] },context);
  expect(unexplained.thesisKind).toBe('unexplained');
  expect(unexplained.causation).toBe('unverified');
  expect(unexplained.marketReferences.sma20).toBe('20.25');
});
