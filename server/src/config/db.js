import pg from 'pg';
import { env } from './env.js';

// Single shared pool. Every query in the app goes through here so that
// connection limits, timeouts, and instrumentation live in one place.
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: parseInt(process.env.PG_POOL_MAX || '10', 10),
  idleTimeoutMillis: 30000,
});

export const query = (text, params) => pool.query(text, params);

// Run fn inside a transaction with a dedicated client. Rolls back on throw.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
