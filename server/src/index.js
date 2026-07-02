import { createApp } from './app.js';
import { env } from './config/env.js';
import { migrate } from './db/migrate.js';
import { startScheduler } from './services/scheduler.js';

async function main() {
  await migrate(); // idempotent; keeps dev/prod schema in sync on boot
  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`[assay] listening on :${env.PORT} (${env.NODE_ENV})`);
  });
  startScheduler();
}

main().catch((err) => {
  console.error('[assay] fatal:', err);
  process.exit(1);
});
