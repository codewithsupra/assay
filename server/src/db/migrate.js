import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, closePool } from '../config/db.js';
import { env } from '../config/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const sql = await readFile(join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

// Allow `npm run migrate` as a standalone entrypoint.
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => {
      console.log(`[migrate] schema applied to ${env.DATABASE_URL}`);
      return closePool();
    })
    .catch((err) => {
      console.error('[migrate] failed:', err.message);
      process.exit(1);
    });
}
