import { query } from '../config/db.js';
import { env } from '../config/env.js';
import { ApiError } from '../middleware/error.js';

// Load-campaign guardrails. This is the second half of the consent pillar:
// verification proves the caller owns the target, these caps bound the blast
// radius of what they can point at it. Hard limits, enforced server-side —
// never trust a client-supplied connections/duration value directly.
export async function requestCampaign(project, { connections, durationS, pipelining } = {}) {
  if (!project.verified_at) throw new ApiError(422, 'project is not ownership-verified');
  if (project.paused) throw new ApiError(422, 'project is paused (emergency stop active)');

  const conn = Math.min(Math.max(1, parseInt(connections || '10', 10)), env.MAX_CAMPAIGN_CONNECTIONS);
  const duration = Math.min(Math.max(1, parseInt(durationS || '10', 10)), env.MAX_CAMPAIGN_DURATION_S);
  const pipe = Math.min(Math.max(1, parseInt(pipelining || '1', 10)), 10);

  const { rows: recent } = await query(
    `SELECT created_at FROM campaigns
      WHERE project_id = $1 AND status IN ('queued', 'running')
      ORDER BY created_at DESC LIMIT 1`,
    [project.id]
  );
  if (recent[0]) throw new ApiError(429, 'a campaign is already queued or running for this project');

  const { rows: cooldown } = await query(
    `SELECT created_at FROM campaigns
      WHERE project_id = $1 AND status = 'done'
        AND created_at > now() - ($2::int * interval '1 second')
      ORDER BY created_at DESC LIMIT 1`,
    [project.id, env.CAMPAIGN_COOLDOWN_S]
  );
  if (cooldown[0]) {
    throw new ApiError(429, `per-target cooldown active: wait ${env.CAMPAIGN_COOLDOWN_S}s between campaigns`);
  }

  const { rows } = await query(
    `INSERT INTO campaigns (project_id, connections, duration_s, pipelining)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [project.id, conn, duration, pipe]
  );
  const campaign = rows[0];
  await query(`INSERT INTO jobs (project_id, type, run_at) VALUES ($1, 'load_campaign', now())`, [
    project.id,
  ]);
  return campaign;
}

export async function claimCampaignForJob(projectId) {
  const { rows } = await query(
    `SELECT * FROM campaigns WHERE project_id = $1 AND status = 'queued'
      ORDER BY created_at LIMIT 1`,
    [projectId]
  );
  return rows[0] || null;
}

export async function markRunning(campaignId) {
  await query(`UPDATE campaigns SET status = 'running', started_at = now() WHERE id = $1`, [campaignId]);
}

export async function markDone(campaignId, result) {
  await query(
    `UPDATE campaigns SET status = 'done', result = $2::jsonb, finished_at = now() WHERE id = $1`,
    [campaignId, JSON.stringify(result)]
  );
}

export async function markAborted(campaignId, reason, partialResult) {
  await query(
    `UPDATE campaigns SET status = 'aborted', error = $2, result = $3::jsonb, finished_at = now() WHERE id = $1`,
    [campaignId, reason, JSON.stringify(partialResult || null)]
  );
}

export async function markFailed(campaignId, error) {
  await query(`UPDATE campaigns SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`, [
    campaignId,
    error,
  ]);
}

export async function getCampaign(campaignId, projectId) {
  const { rows } = await query(`SELECT * FROM campaigns WHERE id = $1 AND project_id = $2`, [
    campaignId,
    projectId,
  ]);
  return rows[0] || null;
}

export async function listCampaigns(projectId) {
  const { rows } = await query(
    `SELECT id, status, connections, duration_s, pipelining, result, error, started_at, finished_at, created_at
       FROM campaigns WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [projectId]
  );
  return rows;
}

export async function latestCompletedCampaign(projectId) {
  const { rows } = await query(
    `SELECT * FROM campaigns WHERE project_id = $1 AND status = 'done'
      ORDER BY created_at DESC LIMIT 1`,
    [projectId]
  );
  return rows[0] || null;
}
