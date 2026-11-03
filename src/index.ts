import { createApp, type Env } from './http';
import { drain } from './coordinator';
import { Foundation } from './persistence';

const app = createApp();
export default {
  fetch: app.fetch,
  async scheduled(event: Pick<ScheduledController, 'scheduledTime' | 'cron'>, env: Env) {
    if (env.JOBS_ENABLED !== 'true') return;
    const store = new Foundation(env.DB);
    try {
      // Foundation-only smoke run, not a market-session calendar or morning report.
      const date = new Date(event.scheduledTime).toISOString().slice(0, 10);
      await store.enqueue(`scheduled:synthetic:${date}`, { pages: 4 }, Date.now());
      await drain(store);
    } catch {
      console.error(JSON.stringify({ code: 'tick_failed' }));
    }
  },
};
