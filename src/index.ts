import { createApp, type Env } from './http';
import { drain } from './coordinator';
import { enqueueMarket, drainMarket, drainCollections } from './market/runtime';
import { Foundation } from './persistence';

const app = createApp();
export default {
  fetch: app.fetch,
  async scheduled(event: Pick<ScheduledController, 'scheduledTime' | 'cron'>, env: Env) {
    if (env.JOBS_ENABLED !== 'true') return;
    const store = new Foundation(env.DB);
    try {
      if (env.MARKET_ENABLED === 'true') {
        await enqueueMarket(store);
        const candidate = await store.db.prepare("SELECT * FROM runs WHERE state IN ('queued','running') AND next_at<=? ORDER BY CASE WHEN json_extract(payload,'$.kind')='market' THEN 0 ELSE 1 END,created_at,id LIMIT 1").bind(Date.now()).first<import('./persistence').Run>();
        if (candidate) {
          const kind = (JSON.parse(candidate.payload) as { kind?: string }).kind;
          if (kind === 'market') await drainMarket(store,env,candidate);
          else if (kind === 'market-collections') await drainCollections(store,env,candidate);
          else await drain(store);
        }
        return;
      }
      // Foundation-only smoke run.
      const date = new Date(event.scheduledTime).toISOString().slice(0, 10);
      await store.enqueue(`scheduled:synthetic:${date}`, { pages: 4 }, Date.now());
      await drain(store);
    } catch {
      console.error(JSON.stringify({ code: 'tick_failed' }));
    }
  },
};
