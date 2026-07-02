// Seed a demo: a verified project with probe history and a signed report.
// Usage: NODE_ENV=development node scripts/seed-demo.js
import http from 'node:http';
import { pool, query } from '../src/config/db.js';
import { migrate } from '../src/db/migrate.js';
import { enqueueProbe, claimJobs, processJob } from '../src/services/scheduler.js';
import { generateReport } from '../src/services/reports.js';
import { env } from '../src/config/env.js';

async function main() {
  await migrate();

  // A local target so the demo works offline.
  const target = http.createServer((req, res) => {
    if (req.url === '/api/ping') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ pong: true, ts: Date.now() }));
    }
    res.end('ok');
  });
  await new Promise((r) => target.listen(0, r));
  const targetUrl = `http://127.0.0.1:${target.address().port}`;

  const { rows: u } = await query(
    `INSERT INTO users (email, name, password_hash) VALUES ('demo@assay.dev','Demo','x')
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`
  );
  const { rows: p } = await query(
    `INSERT INTO projects (user_id, name, target_url, target_host, verify_token, endpoint_spec, verified_at, probe_interval_s)
     VALUES ($1,'Pulse',$2,'localhost','demo-token',$3::jsonb, now(), 300) RETURNING *`,
    [u[0].id, targetUrl, JSON.stringify([{ path: '/api/ping', expectStatus: 200, expectJsonKeys: ['pong'] }])]
  );
  const project = p[0];

  // Run several probes.
  for (let i = 0; i < 8; i++) {
    await enqueueProbe(project.id, { runAt: new Date().toISOString() });
    const [job] = await claimJobs(1);
    if (job) await processJob(job);
    await query(`UPDATE jobs SET status='done' WHERE project_id=$1 AND status='pending'`, [project.id]);
  }

  const report = await generateReport(project, 168);
  console.log('Seeded. Public report:');
  console.log(`  ${env.PUBLIC_BASE_URL}/r/${report.public_id}`);
  console.log(`  ${env.PUBLIC_BASE_URL}/r/${report.public_id}.json`);

  await new Promise((r) => target.close(r));
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
