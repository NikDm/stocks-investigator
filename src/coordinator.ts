import { z } from 'zod';
import { Foundation, type Item, type Lease } from './persistence';

export const syntheticCommand = z.object({ pages: z.number().int().min(1).max(200).default(4) }).strict();
type Stage = { page: number; signal: AbortSignal; deadline: number; lease: Lease };
export async function mapBounded<T, R>(items: T[], execute: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await execute(items[index]!);
    }
  }));
  return results;
}
export async function drain(store: Foundation, options: {
  clock?: () => number;
  execute?: (stage: Stage) => Promise<Item[]>;
} = {}) {
  const clock = options.clock ?? Date.now;
  const start = clock();
  const run = await store.next(start);
  if (!run) return { pages: 0 };
  const lease = await store.claim(run.id, crypto.randomUUID(), clock());
  if (!lease) return { pages: 0 };
  let pages = 0;
  try {
    const command = syntheticCommand.parse(JSON.parse(run.payload));
    let page = run.cursor;
    // The synthetic executor is bounded to 50 tiny rows/stage. Reserve 250 ms CPU
    // per stage, max 64 stages (16 s), leaving 4 s overhead under the 20 s
    // platform aggregate CPU ceiling. New executors require their own benchmark.
    while (page < command.pages && pages < 64 && clock() - start < 195000) {
      await store.renew(lease, clock());
      const current = (await store.run(run.id))!;
      if (current.attempts >= 3) { await store.fail(lease, clock()); break; }
      await store.beginAttempt(lease, clock());
      const stageStart = clock();
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const items = await Promise.race([
          options.execute ? options.execute({ page, signal: controller.signal, deadline: stageStart + 35000, lease })
            : Promise.resolve([{ id: `synthetic-${page}`, kind: 'universe' as const, acquiredAt: stageStart, value: { synthetic: true, page } }]),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => {
            controller.abort(); reject(new Error('stage_timeout'));
          }, 45000); }),
        ]);
        if (clock() - stageStart > 45000 || clock() - start >= 240000) throw new Error('stage_timeout');
        await store.stage(lease, page, items, clock(), stageStart);
      } finally { if (timeout !== undefined) clearTimeout(timeout); controller.abort(); }
      page++; pages++;
    }
    if (page === command.pages && clock() - start < 230000) {
      const current = (await store.run(run.id))!;
      if (current.attempts >= 3) { await store.fail(lease, clock()); return { pages }; }
      await store.beginAttempt(lease, clock());
      await store.renew(lease, clock());
      if (!await store.report(run.id)) await store.publish(lease, { id: run.id, cutoff: clock(), expectedPages: command.pages }, clock());
      await store.certify(lease, run.id, clock);
      await store.complete(lease, clock());
    }
  } catch {
    // Fixed error codes only: provider errors may contain credentials or raw text.
    await store.fail(lease, clock());
  } finally {
    // On a killed invocation this is skipped; the 90-second lease permits recovery.
    await store.release(lease, clock());
  }
  return { pages };
}
