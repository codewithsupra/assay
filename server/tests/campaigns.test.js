import { jest } from '@jest/globals';
import http from 'node:http';
import { pool, query } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { resetDb } from './setup.js';
import { requestCampaign, latestCompletedCampaign } from '../src/services/campaigns.js';
import { claimJobs, processJob } from '../src/services/scheduler.js';
import { generateReport } from '../src/services/reports.js';
import { ApiError } from '../src/middleware/error.js';

let target;
let targetUrl;

beforeAll(async () => {
  await resetDb();
  target = http.createServer((req, res) => res.end('ok'));
  await new Promise((r) => target.listen(0, r));
  targetUrl = `http://127.0.0.1:${target.address().port}`;
});

afterAll(async () => {
  await new Promise((r) => target.close(r));
  await pool.end();
});

async function makeProject({ verified = true, paused = false } = {}) {
  const { rows: u } = await query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1,'U','x') RETURNING id`,
    [`u${Math.random()}@x.com`]
  );
  const { rows } = await query(
    `INSERT INTO projects (user_id, name, target_url, target_host, verify_token, verified_at, paused)
     VALUES ($1,'P',$2,'h','t',$3,$4) RETURNING *`,
    [u[0].id, targetUrl, verified ? new Date() : null, paused]
  );
  return rows[0];
}

describe('load campaign consent + guardrails', () => {
  test('rejects an unverified project', async () => {
    const project = await makeProject({ verified: false });
    await expect(requestCampaign(project, { connections: 5, durationS: 2 })).rejects.toThrow(ApiError);
  });

  test('rejects a paused project', async () => {
    const project = await makeProject({ paused: true });
    await expect(requestCampaign(project, { connections: 5, durationS: 2 })).rejects.toThrow(ApiError);
  });

  test('clamps connections and duration to the configured caps', async () => {
    const project = await makeProject();
    const campaign = await requestCampaign(project, {
      connections: env.MAX_CAMPAIGN_CONNECTIONS + 500,
      durationS: env.MAX_CAMPAIGN_DURATION_S + 500,
    });
    expect(campaign.connections).toBe(env.MAX_CAMPAIGN_CONNECTIONS);
    expect(campaign.duration_s).toBe(env.MAX_CAMPAIGN_DURATION_S);
    // This test only checks clamping; retire the job so its (clamped, but
    // still relatively long) duration can't be claimed by a later test that
    // expects to claim its own short-lived campaign job.
    await query(`UPDATE jobs SET status = 'done' WHERE project_id = $1`, [project.id]);
  });

  test('rejects a second campaign while one is queued', async () => {
    const project = await makeProject();
    await requestCampaign(project, { connections: 2, durationS: 1 });
    await expect(requestCampaign(project, { connections: 2, durationS: 1 })).rejects.toThrow(ApiError);
    await query(`UPDATE jobs SET status = 'done' WHERE project_id = $1`, [project.id]);
  });
});

describe('runner executes a real campaign end-to-end', () => {
  test('processJob runs autocannon against the local target and records a summarized result', async () => {
    const project = await makeProject();
    await requestCampaign(project, { connections: 2, durationS: 1, pipelining: 1 });

    const [job] = await claimJobs(1, ['load_campaign']);
    expect(job).toBeTruthy();
    const out = await processJob(job);
    expect(out.ok).toBe(true);

    const campaign = await latestCompletedCampaign(project.id);
    expect(campaign).toBeTruthy();
    expect(campaign.result.rps_sustained).toBeGreaterThan(0);
    expect(campaign.result.requests_total).toBeGreaterThan(0);
    expect(typeof campaign.result.latency_p99_ms).toBe('number');
  }, 15000);

  test('signed report includes the load section once a campaign has completed', async () => {
    const project = await makeProject();
    await requestCampaign(project, { connections: 2, durationS: 1 });
    const [job] = await claimJobs(1, ['load_campaign']);
    await processJob(job);

    const report = await generateReport(project, 24);
    expect(report.payload.load).toBeTruthy();
    expect(report.payload.load.rps_sustained).toBeGreaterThan(0);
  }, 15000);
});
