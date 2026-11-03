export const momentumThesis = { outcome: 'accepted', thesisKind: 'unexplained', facts: [], interpretations: [], unknowns: ['Explanation remains unknown.'],
  thesis: { text: 'Momentum may persist above the moving average.', evidenceIds: [], metricKeys: ['sma20'] },
  invalidation: [{ text: 'A close below the moving average invalidates the thesis.', evidenceIds: [], metricKeys: ['sma20'], predicate: { kind: 'close_below', metric: 'sma20' } }],
  horizonSessions: 20, attractiveness: 'conditional', priceCondition: 'sma20' };
