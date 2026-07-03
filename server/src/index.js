import { createApp } from './app.js';
import { env } from './config/env.js';
import { migrate } from './db/migrate.js';
import { startScheduler } from './services/scheduler.js';
import { initIo, emitProgress } from './sockets/io.js';
import { subscribe } from './services/pubsub.js';

// API process: HTTP + Socket.io + scheduler. By default the scheduler only
// polls 'probe' jobs -- load campaigns are meant to run on a separate runner
// process (src/runner.js) so sustained load generation never shares an event
// loop with request handling. Set SCHEDULER_JOB_TYPES=probe,load_campaign to
// have this one process handle both, for hosts/plans with no separate worker
// service (e.g. Render's free tier). Either way, cross-process progress goes
// over Postgres LISTEN/NOTIFY (see services/pubsub.js), not shared memory.
async function main() {
  await migrate(); // idempotent; keeps dev/prod schema in sync on boot
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`[assay] listening on :${env.PORT} (${env.NODE_ENV})`);
  });
  initIo(server);
  startScheduler({ types: env.SCHEDULER_JOB_TYPES });
  subscribe((event) => emitProgress(event.projectId, event.type, event));
}

main().catch((err) => {
  console.error('[assay] fatal:', err);
  process.exit(1);
});
