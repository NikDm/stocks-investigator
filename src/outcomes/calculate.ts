import { D, rounded } from '../decimal';
export type OutcomeInputs = {
  securityId: string; entrySession: string; horizon: 10 | 20 | 30; now: number;
  sessions: { date: string; closeAt: number; deadline: number }[];
  reference: { price: string; id: string; acquiredAt: number } | null;
  actionsThrough: string | null;
  actions: Action[];
  closes: { id: string; securityId: string; session: string; price: string; acquiredAt: number }[];
};
export type Action = { id: string; securityId: string; session: string; acquiredAt: number; order: number } & (
  { kind: 'split'; ratio: string } | { kind: 'dividend'; cash: string } |
  { kind: 'conversion'; cash: string; successors: { securityId: string; ratio: string }[] } |
  { kind: 'spinoff'; successors: { securityId: string; ratio: string }[] } | { kind: 'unresolved' }
);
export type Outcome = { status: 'pending' | 'unresolved' | 'resolved'; reason: string | null; endpoint: string | null;
  gross: string | null; adjusted: string | null; sensitivity0: string | null; sensitivity25: string | null;
  downside: { status: 'complete' | 'partial' | 'unavailable'; observed: number; expected: number; value: string | null }; inputIds: string[] };

/** Frozen prices and verified entitlements only. Purchase and current-catalogue state are deliberately absent. */
export function calculateOutcome(input: OutcomeInputs): Outcome {
  const window = input.sessions.filter(s => s.date>=input.entrySession).slice(0,input.horizon), endpoint = window[input.horizon-1];
  const result: Outcome = { status: 'pending', reason: null, endpoint: endpoint?.date ?? null, gross: null, adjusted: null,
    sensitivity0: null, sensitivity25: null, downside: { status: 'unavailable', observed: 0, expected: input.horizon, value: null }, inputIds: [] };
  if (!endpoint || input.now<endpoint.closeAt) return result;
  result.status = 'unresolved';
  if (!input.reference || input.reference.acquiredAt>input.now || !new D(input.reference.price).isPositive()) return { ...result, reason: 'missing_reference' };
  result.inputIds.push(input.reference.id);
  if (!input.actionsThrough || input.actionsThrough<endpoint.date) return { ...result, reason: 'unresolved_action' };
  const p0 = new D(input.reference.price), holdings = new Map([[input.securityId,new D(1)]]);
  let cash = new D(0), worst = new D(0), observed = 0, final: InstanceType<typeof D> | null = null;
  const actions = input.actions.filter(a => a.session>input.entrySession && a.session<=endpoint.date)
    .sort((a,b) => a.session.localeCompare(b.session) || a.order-b.order || a.id.localeCompare(b.id));
  let actionCursor = 0;
  for (const session of window) {
    while (actions[actionCursor] && actions[actionCursor]!.session<=session.date) {
      const action = actions[actionCursor++]!;
      const quantity = holdings.get(action.securityId);
      if (!quantity || quantity.isZero()) continue;
      result.inputIds.push(action.id);
      if (actions.some(other => other.id!==action.id && other.securityId===action.securityId && other.session===action.session && other.order===action.order)) return { ...result, reason: 'unresolved_action' };
      if (action.kind==='unresolved' || action.acquiredAt>input.now) return { ...result, reason: 'unresolved_action' };
      if (action.kind==='split') holdings.set(action.securityId,quantity.mul(action.ratio));
      if (action.kind==='dividend' && action.session>input.entrySession) cash = cash.plus(quantity.mul(action.cash));
      if (action.kind==='conversion' || action.kind==='spinoff') {
        if (action.kind==='conversion') { holdings.delete(action.securityId); cash = cash.plus(quantity.mul(action.cash)); }
        for (const successor of action.successors) holdings.set(successor.securityId,(holdings.get(successor.securityId) ?? new D(0)).plus(quantity.mul(successor.ratio)));
      }
    }
    let wealth: InstanceType<typeof D> | null = cash;
    for (const [securityId,quantity] of holdings) {
      if (quantity.isZero()) continue;
      const prices = input.closes.filter(p => p.securityId===securityId && p.session===session.date && p.acquiredAt<=input.now);
      const price = prices[0];
      if (!price || !new D(price.price).isPositive() || prices.some(p => !new D(p.price).eq(price.price))) { wealth = null; break; }
      result.inputIds.push(...prices.map(p => p.id));
      wealth = wealth!.plus(quantity.mul(price.price));
    }
    if (wealth!==null) { observed++; worst = D.min(worst,wealth.div(p0).minus(1)); }
    if (session.date===endpoint.date) final = wealth;
  }
  result.inputIds = [...new Set(result.inputIds)].sort();
  result.downside = { status: observed===input.horizon ? 'complete' : observed>0 ? 'partial' : 'unavailable', observed, expected: input.horizon, value: observed ? rounded(worst) : null };
  if (final===null) return { ...result, reason: 'missing_endpoint' };
  const gross = rounded(final.div(p0).minus(1));
  return { ...result, status: 'resolved', reason: null, gross, sensitivity0: gross,
    adjusted: rounded(final.mul('0.999').div(p0.mul('1.001')).minus(1)), sensitivity25: rounded(final.mul('0.9975').div(p0.mul('1.0025')).minus(1)) };
}
