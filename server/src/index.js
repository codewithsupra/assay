import { createApp } from './app.js';
import { env } from './config/env.js';
import { migrate } from './db/migrate.js';
import { startScheduler } from './services/scheduler.js';
import { initIo, emitProgress } from './sockets/io.js';
import { subscribe } from './services/pubsub.js';

// API process: HTTP + Socket.io + the probe scheduler only. Load campaigns
// run in a separate long-running process (src/runner.js) -- sustained load
// generation shouldn't share an event loop with request handling. The two
// processes share the Postgres jobs table and talk live progress over
// LISTEN/NOTIFY (see services/pubsub.js), since they can't share memory.
async function main() {
  await migrate(); // idempotent; keeps dev/prod schema in sync on boot
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`[assay] listening on :${env.PORT} (${env.NODE_ENV})`);
  });
  initIo(server);
  startScheduler({ types: ['probe'] });
  subscribe((event) => emitProgress(event.projectId, event.type, event));
}

main().catch((err) => {
  console.error('[assay] fatal:', err);
  process.exit(1);
});
