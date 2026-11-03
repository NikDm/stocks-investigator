import type { ResearchLedger } from './ledger';
import type { ModelRequest, ResearchModel } from './researcher';

// Callers durably checkpoint the reservation ID before entering this operation.
// This owns the common timeout, cancellation and known-usage reconciliation policy;
// callers retain their own repair/abstention/recovery state machines.
export async function dispatchModel(model: ResearchModel, request: ModelRequest, ledger: ResearchLedger,
  callId: string, deadline: number, clock: () => number): Promise<unknown> {
  const remaining = Math.min(20000,deadline-clock());
  if (remaining<=0) throw new Error('model_deadline');
  const controller = new AbortController(); let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      model.complete(request,controller.signal),
      new Promise<never>((_,reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error('model_timeout')); },remaining); }),
    ]);
    await ledger.settleModel(callId,result.usage);
    return result.output;
  } finally { if (timeout!==undefined) clearTimeout(timeout); controller.abort(); }
}
