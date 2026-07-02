import crypto from 'node:crypto';
import { query } from '../config/db.js';
import { signReport } from './signing.js';
import { latestCompletedCampaign } from './campaigns.js';

// Aggregate a project's probe history over a window into a summary, then sign
// it. Uptime %, p95 latency, and contract-violation counts are computed in SQL
// so we never load raw probe rows into the Node process.
export async function buildSummary(projectId, windowHours = 24 * 7) {
  const { rows } = await query(
    `SELECT
        count(*)                                             AS total,
        count(*) FILTER (WHERE ok)                           AS up,
        count(*) FILTER (WHERE NOT contract_ok)              AS contract_failures,
        percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms)
          FILTER (WHERE latency_ms IS NOT NULL)              AS p95_latency_ms,
        avg(latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS avg_latency_ms,
        min(created_at)                                      AS window_start,
        max(created_at)                                      AS window_end
       FROM probes
      WHERE project_id = $1
        AND created_at >= now() - ($2::int * interval '1 hour')`,
    [projectId, windowHours]
  );
  const r = rows[0];
  const total = Number(r.total);
  return {
    total_probes: total,
    uptime_pct: total ? Number(((Number(r.up) / total) * 100).toFixed(2)) : null,
    p95_latency_ms: r.p95_latency_ms != null ? Number(r.p95_latency_ms) : null,
    avg_latency_ms: r.avg_latency_ms != null ? Number(Number(r.avg_latency_ms).toFixed(1)) : null,
    contract_violations: Number(r.contract_failures),
    window_start: r.window_start,
    window_end: r.window_end,
    window_hours: windowHours,
  };
}

export async function generateReport(project, windowHours = 24 * 7) {
  const summary = await buildSummary(project.id, windowHours);
  // The load-campaign numbers, if any exist, are what turn "up" into
  // "sustained N req/s" -- the README money-shot line.
  const campaign = await latestCompletedCampaign(project.id);
  const load = campaign
    ? {
        campaign_id: campaign.id,
        ran_at: campaign.finished_at,
        ...campaign.result,
      }
    : null;
  const publicId = crypto.randomBytes(9).toString('base64url');
  // Normalize through JSON so the exact bytes we sign are the exact bytes we
  // store (JSONB turns Date columns into strings on read; sign the same form).
  const payload = JSON.parse(
    JSON.stringify({
      project: { id: project.id, name: project.name, target_url: project.target_url },
      summary,
      load,
      issued_at: new Date().toISOString(),
      public_id: publicId,
    })
  );
  const { signature, publicKey } = signReport(payload);

  const { rows } = await query(
    `INSERT INTO reports (project_id, public_id, payload, signature, public_key)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     RETURNING id, public_id, created_at`,
    [project.id, publicId, JSON.stringify(payload), signature, publicKey]
  );
  return { ...rows[0], payload, signature, public_key: publicKey };
}

export async function getReportByPublicId(publicId) {
  const { rows } = await query(
    `SELECT public_id, payload, signature, public_key, created_at
       FROM reports WHERE public_id = $1`,
    [publicId]
  );
  return rows[0] || null;
}
