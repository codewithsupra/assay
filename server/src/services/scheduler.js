import crypto from 'node:crypto';
import { pool, query } from '../config/db.js';
import { env } from '../config/env.js';
import { runProbe } from './probe.js';

// The orchestrator core.
//
// Jobs live in a Postgres table. A worker claims due jobs with
// SELECT ... FOR UPDATE SKIP LOCKED: the row lock plus SKIP LOCKED means N
// workers can hammer the same table and each due job is handed to exactly one
// of them, with no application-level coordination. This is the direct SQL
// analogue of Pulse's atomic findOneAndUpdate scheduler claim.

const WORKER_ID = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;

// Claim up to `limit` due jobs atomically and mark them running.
export async function claimJobs(limit = 5, client = pool) {
  const { rows } = await client.query(
    `UPDATE jobs
        SET status = 'running',
            locked_by = $1,
            locked_at = now(),
            attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM jobs
         WHERE run_at <= now()
           AND (
             status = 'pending'
             OR (status = 'running' AND locked_at < now() - ($2::int * interval '1 millisecond'))
           )
         ORDER BY run_at
         FOR UPDATE SKIP LOCKED
         LIMIT $3
      )
      RETURNING id, project_id, type`,
    [WORKER_ID, env.JOB_LEASE_MS, limit]
  );
  return rows;
}

async function loadProject(projectId) {
  const { rows } = await query(
    `SELECT id, user_id, target_url, endpoint_spec, probe_interval_s, paused, verified_at
       FROM projects WHERE id = $1`,
    [projectId]
  );
  return rows[0] || null;
}

async function recordProbe(projectId, result) {
  await query(
    `INSERT INTO probes
       (project_id, ok, status_code, latency_ms, error, contract_ok, contract_violations)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      projectId,
      result.ok,
      result.status_code,
      result.latency_ms,
      result.error,
      result.contract_ok,
      JSON.stringify(result.contract_violations),
    ]
  );
}

// Reschedule a recurring probe job for its next interval.
async function reschedule(jobId, intervalSeconds) {
  await query(
    `UPDATE jobs
        SET status = 'pending',
            locked_by = NULL,
            locked_at = NULL,
            run_at = now() + ($2::int * interval '1 second')
      WHERE id = $1`,
    [jobId, intervalSeconds]
  );
}

export async function processJob(job) {
  const project = await loadProject(job.project_id);
  // Consent + lifecycle guards: never probe an unverified or paused project,
  // even if a stale job exists. Such jobs are retired, not run.
  if (!project || !project.verified_at || project.paused) {
    await query(`UPDATE jobs SET status = 'done', locked_by = NULL WHERE id = $1`, [job.id]);
    return { skipped: true };
  }

  try {
    const result = await runProbe(project);
    await recordProbe(project.id, result);
    await reschedule(job.id, project.probe_interval_s);
    return { ok: result.ok };
  } catch (err) {
    await query(
      `UPDATE jobs SET status = 'pending', locked_by = NULL, locked_at = NULL,
              last_error = $2, run_at = now() + interval '60 seconds'
        WHERE id = $1`,
      [job.id, err.message]
    );
    return { error: err.message };
  }
}

// One scheduler tick: claim a batch and process it. Returns count processed.
export async function tick(batchSize = 5) {
  const jobs = await claimJobs(batchSize);
  for (const job of jobs) {
    await processJob(job);
  }
  return jobs.length;
}

let timer = null;

export function startScheduler({ intervalMs = 5000, batchSize = 5 } = {}) {
  if (timer) return;
  const loop = async () => {
    try {
      await tick(batchSize);
    } catch (err) {
      console.error('[scheduler] tick error:', err.message);
    }
  };
  timer = setInterval(loop, intervalMs);
  console.log(`[scheduler] started (worker ${WORKER_ID}, every ${intervalMs}ms)`);
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

// Enqueue a probe job for a project if one is not already pending.
export async function enqueueProbe(projectId, { runAt } = {}) {
  await query(
    `INSERT INTO jobs (project_id, type, run_at)
       SELECT $1, 'probe', COALESCE($2, now())
      WHERE NOT EXISTS (
        SELECT 1 FROM jobs WHERE project_id = $1 AND type = 'probe' AND status IN ('pending', 'running')
      )`,
    [projectId, runAt || null]
  );
}
