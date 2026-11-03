import type { Lease } from '../persistence';
import { MarketCapture } from './capture';
import { ProviderFailure } from './provider';
import type { MarketRequest, ProviderPage } from './types';
export type PageSource = { page: (request: MarketRequest & { token: string | null }, signal: AbortSignal) => Promise<ProviderPage> };
export class MarketWorker {
  constructor(readonly capture: MarketCapture, readonly source: PageSource, readonly clock: () => number = Date.now) {}
  async tick(lease: Lease, id: string, maxPages = 8) {
    const started = this.clock();
    let committed = 0;
    for (let step = 0; step < Math.min(maxPages,32) && this.clock() - started < 195000; step++) {
      const tasks = await this.capture.tasks(id,'',this.clock());
      const task = tasks.find(t => t.state === 'pending' && t.next_at <= this.clock());
      if (!task) break;
      await this.capture.foundation.renew(lease, this.clock());
      if (await this.capture.taskCheckpoint(lease, id, task)) { committed++; continue; }
      if (task.attempts >= 3 || task.request.deadline !== undefined && this.clock() >= task.request.deadline) {
        await this.capture.taskFailure(lease, id, task, 'deadline_or_attempt_limit', this.clock(), true); continue;
      }
      await this.capture.taskAttempt(lease, id, task);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const result = await this.source.page({ ...task.request, token: task.token }, controller.signal);
        if (this.clock() - started >= 230000 || controller.signal.aborted) throw new ProviderFailure('timeout');
        if (result.nextToken !== null && (result.nextToken === task.token || task.page >= 999)) throw new ProviderFailure('pagination_cycle', undefined, true);
        await this.capture.ingest(lease, id, { task: task.id, page: task.page, ...result });
        await this.capture.taskCheckpoint(lease, id, task);
        committed++;
      } catch (error) {
        const failure = error instanceof ProviderFailure ? error : new ProviderFailure('provider_or_schema', undefined, true);
        const retryAt = Math.max(this.clock() + 1000 * 2 ** task.attempts + Math.floor(Math.random() * 1000), failure.retryAt ?? 0);
        if (failure.code === 'invalid_request' && task.request.securities.length > 1) {
          const middle = Math.ceil(task.request.securities.length/2);
          await this.capture.plan(lease,id,[{ ...task.request, id: `${task.id}:a`, securities: task.request.securities.slice(0,middle) },{ ...task.request, id: `${task.id}:b`, securities: task.request.securities.slice(middle) }]);
          await this.capture.taskPartition(lease,id,task);
        } else if (['local_rate_limit','request_budget'].includes(failure.code)) await this.capture.taskDefer(lease,id,task,retryAt,failure.code);
        else await this.capture.taskFailure(lease, id, task, failure.code, retryAt, failure.permanent);
      } finally { clearTimeout(timer); }
    }
    return { committed, tasks: await this.capture.tasks(id) };
  }
}
