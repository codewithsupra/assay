import { jest } from '@jest/globals';
import http from 'node:http';
import { pool, query } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { resetDb } from './setup.js';
import { claimJobs, processJob, enqueueProbe } from '../src/services/scheduler.js';
import { generateReport, buildSummary, getReportByPublicId } from '../src/services/reports.js';
import { verifyReport } from '../src/services/signing.js';

let target;
let targetUrl;
let healthy = true;

beforeAll(async () => {
  await resetDb();
  target = http.createServer((req, res) => {
    if (req.url === '/api/ping') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ pong: true }));
    }
    res.statusCode = healthy ? 200 : 503;
    res.end('ok');
  });
  await new Promise((r) => target.listen(0, r));
  targetUrl = `http://127.0.0.1:${target.address().port}`;
});

afterAll(async () => {
  await new Promise((r) => target.close(r));
  await pool.end();
});

async function makeVerifiedProject(spec = []) {
  const { rows: u } = await query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1,'U','x') RETURNING id`,
    [`u${Math.random()}@x.com`]
  );
  const { rows } = await query(
    `INSERT INTO projects (user_id, name, target_url, target_host, verify_token, endpoint_spec, verified_at, probe_interval_s)
     VALUES ($1,'P',$2,'h','t',$3::jsonb, now(), 300) RETURNING *`,
    [u[0].id, targetUrl, JSON.stringify(spec)]
  );
  return rows[0];
}

describe('atomic job claim (SELECT ... FOR UPDATE SKIP LOCKED)', () => {
  test('two concurrent claimers never claim the same job', async () => {
    const project = await makeVerifiedProject();
    // Seed 20 due jobs.
    for (let i = 0; i < 20; i++) {
      await query(`INSERT INTO jobs (project_id, type, run_at) VALUES ($1,'probe', now())`, [project.id]);
    }
    // Two workers claim in parallel.
    const [a, b] = await Promise.all([claimJobs(20), claimJobs(20)]);
    const ids = [...a, ...b].map((j) => j.id);
    const unique = new Set(ids);
    expect(ids.length).toBe(20); // all claimed
    expect(unique.size).toBe(20); // none claimed twice
  });
});

describe('probe execution + signed report', () => {
  test('processing a job records a probe and reschedules', async () => {
    const project = await makeVerifiedProject([{ path: '/api/ping', expectStatus: 200, expectJsonKeys: ['pong'] }]);
    await enqueueProbe(project.id);
    const [job] = await claimJobs(1);
    const out = await processJob(job);
    expect(out.ok).toBe(true);

    const { rows } = await query(`SELECT * FROM probes WHERE project_id = $1`, [project.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(true);
    expect(rows[0].contract_ok).toBe(true);

    // Job rescheduled into the future, not left running.
    const { rows: jrows } = await query(`SELECT status, run_at > now() AS future FROM jobs WHERE id = $1`, [job.id]);
    expect(jrows[0].status).toBe('pending');
    expect(jrows[0].future).toBe(true);
  });

  test('contract violation is captured', async () => {
    const project = await makeVerifiedProject([{ path: '/api/ping', expectStatus: 404 }]);
    await enqueueProbe(project.id);
    const [job] = await claimJobs(1);
    await processJob(job);
    const { rows } = await query(`SELECT contract_ok, contract_violations FROM probes WHERE project_id = $1`, [project.id]);
    expect(rows[0].contract_ok).toBe(false);
    expect(rows[0].contract_violations.length).toBe(1);
  });

  test('paused/unverified projects are never probed', async () => {
    const project = await makeVerifiedProject();
    await query(`UPDATE projects SET paused = true WHERE id = $1`, [project.id]);
    await enqueueProbe(project.id);
    const [job] = await claimJobs(1);
    const out = await processJob(job);
    expect(out.skipped).toBe(true);
    const { rows } = await query(`SELECT count(*)::int AS n FROM probes WHERE project_id = $1`, [project.id]);
    expect(rows[0].n).toBe(0);
  });

  test('report summary is signed and independently verifiable', async () => {
    const project = await makeVerifiedProject();
    await enqueueProbe(project.id);
    const [job] = await claimJobs(1);
    await processJob(job);

    const summary = await buildSummary(project.id, 24);
    expect(summary.total_probes).toBeGreaterThan(0);

    const report = await generateReport(project, 24);
    const valid = verifyReport(report.payload, report.signature, report.public_key);
    expect(valid).toBe(true);

    // Tampering with the payload breaks the signature.
    const tampered = { ...report.payload, project: { ...report.payload.project, name: 'HACKED' } };
    expect(verifyReport(tampered, report.signature, report.public_key)).toBe(false);

    // Regression: the report must still verify after a JSONB round-trip
    // (Date columns come back as strings — sign form must equal stored form).
    const stored = await getReportByPublicId(report.public_id);
    expect(verifyReport(stored.payload, stored.signature, stored.public_key)).toBe(true);
  });
});
