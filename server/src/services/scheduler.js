import crypto from 'node:crypto';
import { pool, query } from '../config/db.js';
import { env } from '../config/env.js';
import { runProbe } from './probe.js';
import { runLoadCampaign, summarizeResult } from './load-runner.js';
import * as campaigns from './campaigns.js';
import { publish } from './pubsub.js';

// The orchestrator core.
//
// Jobs live in a Postgres table. A worker claims due jobs with
// SELECT ... FOR UPDATE SKIP LOCKED: the row lock plus SKIP LOCKED means N
// workers can hammer the same table and each due job is handed to exactly one
// of them, with no application-level coordination. This is the direct SQL
// analogue of Pulse's atomic findOneAndUpdate scheduler claim.

const WORKER_ID = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;

// Claim up to `limit` due jobs of the given types atomically and mark them
// running. `types` lets the API process and the load-runner process share one
// table while each only ever claims the kind of job it knows how to run.
export async function claimJobs(limit = 5, types = ['probe', 'load_campaign'], client = pool) {
  const { rows } = await client.query(
    `UPDATE jobs
        SET status = 'running',
            locked_by = $1,
            locked_at = now(),
            attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM jobs
         WHERE run_at <= now()
           AND type = ANY($4::text[])
           AND (
             status = 'pending'
             OR (status = 'running' AND locked_at < now() - ($2::int * interval '1 millisecond'))
           )
         ORDER BY run_at
         FOR UPDATE SKIP LOCKED
         LIMIT $3
      )
      RETURNING id, project_id, type`,
    [WORKER_ID, env.JOB_LEASE_MS, limit, types]
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

async function processProbeJob(job, project) {
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

// Run one load campaign: claim the queued campaign row for this project,
// stream tick progress over the pubsub channel, persist the final (or
// error-budget-aborted) result, and retire the job -- campaigns are one-shot,
// never rescheduled.
async function processLoadCampaignJob(job, project) {
  const campaign = await campaigns.claimCampaignForJob(project.id);
  if (!campaign) {
    await query(`UPDATE jobs SET status = 'done', locked_by = NULL WHERE id = $1`, [job.id]);
    return { skipped: true };
  }

  await campaigns.markRunning(campaign.id);
  await publish({ type: 'campaign:started', projectId: project.id, campaignId: campaign.id });

  try {
    const { result, aborted } = await runLoadCampaign({
      url: project.target_url,
      connections: campaign.connections,
      durationS: campaign.duration_s,
      pipelining: campaign.pipelining,
      onTick: (sample) => {
        publish({ type: 'campaign:progress', projectId: project.id, campaignId: campaign.id, sample });
      },
    });

    const summary = summarizeResult(result);
    if (aborted) {
      await campaigns.markAborted(campaign.id, 'error budget exceeded', summary);
      await publish({ type: 'campaign:aborted', projectId: project.id, campaignId: campaign.id, summary });
    } else {
      await campaigns.markDone(campaign.id, summary);
      await publish({ type: 'campaign:done', projectId: project.id, campaignId: campaign.id, summary });
    }
    await query(`UPDATE jobs SET status = 'done', locked_by = NULL WHERE id = $1`, [job.id]);
    return { ok: true, campaignId: campaign.id };
  } catch (err) {
    await campaigns.markFailed(campaign.id, err.message);
    await publish({ type: 'campaign:failed', projectId: project.id, campaignId: campaign.id, error: err.message });
    await query(`UPDATE jobs SET status = 'done', locked_by = NULL, last_error = $2 WHERE id = $1`, [
      job.id,
      err.message,
    ]);
    return { error: err.message };
  }
}

export async function processJob(job) {
  const project = await loadProject(job.project_id);
  // Consent + lifecycle guards: never act on an unverified or paused project,
  // even if a stale job exists. Such jobs are retired, not run.
  if (!project || !project.verified_at || project.paused) {
    await query(`UPDATE jobs SET status = 'done', locked_by = NULL WHERE id = $1`, [job.id]);
    return { skipped: true };
  }

  if (job.type === 'load_campaign') return processLoadCampaignJob(job, project);
  return processProbeJob(job, project);
}

// One scheduler tick: claim a batch and process it. Returns count processed.
export async function tick(batchSize = 5, types = ['probe', 'load_campaign']) {
  const jobs = await claimJobs(batchSize, types);
  for (const job of jobs) {
    await processJob(job);
  }
  return jobs.length;
}

let timer = null;

// `types` lets a process opt into only the job kinds it's built to run --
// the API process schedules probes only; the standalone runner (src/runner.js)
// schedules load_campaign only.
export function startScheduler({ intervalMs = 5000, batchSize = 5, types = ['probe', 'load_campaign'] } = {}) {
  if (timer) return;
  const loop = async () => {
    try {
      await tick(batchSize, types);
    } catch (err) {
      console.error('[scheduler] tick error:', err.message);
    }
  };
  timer = setInterval(loop, intervalMs);
  console.log(`[scheduler] started (worker ${WORKER_ID}, types=${types.join(',')}, every ${intervalMs}ms)`);
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
