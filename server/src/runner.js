// The runner fleet -- a standalone process dedicated to load campaigns.
// Deployed separately from the API (Render/Fly worker, not an edge function):
// autocannon needs a real, long-running process to generate sustained traffic
// without competing with request-handling for the event loop. Scales
// horizontally by running more of this process; SKIP LOCKED job claiming
// means they never step on each other or the API's probe scheduler.
import { migrate } from './db/migrate.js';
import { startScheduler } from './services/scheduler.js';

async function main() {
  await migrate();
  startScheduler({ types: ['load_campaign'], intervalMs: 2000, batchSize: 1 });
  console.log('[assay-runner] watching for load_campaign jobs');
}

main().catch((err) => {
  console.error('[assay-runner] fatal:', err);
  process.exit(1);
});
