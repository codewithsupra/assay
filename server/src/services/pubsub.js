import pg from 'pg';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';

// Cross-process event bus using Postgres LISTEN/NOTIFY. The load-runner is a
// separate OS process from the API (deliberately -- sustained load generation
// shouldn't share an event loop with request handling), so it can't call the
// API's in-process Socket.io emitter directly. NOTIFY is the transport: the
// runner publishes a small JSON payload, the API process (which holds the
// only Socket.io server) relays it to subscribed browsers.
const CHANNEL = 'assay_events';

export async function publish(event) {
  // pg_notify takes the channel as data, not identifier, so this is safe
  // against injection despite being a plain query.
  await pool.query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify(event)]);
}

// LISTEN requires a single dedicated, long-lived connection -- it cannot be a
// connection borrowed from the pool, since pooled connections are recycled.
export function subscribe(onEvent) {
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  client.connect().then(() => {
    client.query(`LISTEN ${CHANNEL}`);
  });
  client.on('notification', (msg) => {
    try {
      onEvent(JSON.parse(msg.payload));
    } catch (err) {
      console.error('[pubsub] bad payload:', err.message);
    }
  });
  client.on('error', (err) => console.error('[pubsub] connection error:', err.message));
  return () => client.end();
}
