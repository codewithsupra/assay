import { query } from '../config/db.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { generateToken, hostFromUrl, verifyOwnership } from '../services/ownership.js';
import { enqueueProbe } from '../services/scheduler.js';
import { generateReport } from '../services/reports.js';
import { env } from '../config/env.js';

// Load a project and assert the caller owns it. Per-user isolation is enforced
// in the WHERE clause of every query — never trust an id from the client alone.
async function ownedProject(projectId, userId) {
  const { rows } = await query(`SELECT * FROM projects WHERE id = $1 AND user_id = $2`, [
    projectId,
    userId,
  ]);
  if (!rows[0]) throw new ApiError(404, 'project not found');
  return rows[0];
}

export const createProject = asyncHandler(async (req, res) => {
  const { name, target_url, endpoint_spec, probe_interval_s } = req.body || {};
  if (!name) throw new ApiError(400, 'name required');
  let host;
  try {
    host = hostFromUrl(target_url);
    if (!/^https?:$/.test(new URL(target_url).protocol)) throw new Error('bad protocol');
  } catch {
    throw new ApiError(400, 'target_url must be a valid http(s) URL');
  }
  const interval = Math.max(env.MIN_PROBE_INTERVAL_S, parseInt(probe_interval_s || '300', 10));
  const token = generateToken();

  const { rows } = await query(
    `INSERT INTO projects (user_id, name, target_url, target_host, verify_token, endpoint_spec, probe_interval_s)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     RETURNING *`,
    [req.user.id, name, target_url, host, token, JSON.stringify(endpoint_spec || []), interval]
  );
  const project = rows[0];
  res.status(201).json({
    project,
    verification: {
      instructions: 'Prove ownership, then POST to /verify. Either method works.',
      http: {
        path: env.VERIFY_PATH,
        expected_body: token,
        example: `serve "${token}" at ${new URL(target_url).origin}${env.VERIFY_PATH}`,
      },
      dns: {
        record: `assay-verify.${new URL(target_url).hostname}`,
        type: 'TXT',
        value: token,
      },
    },
  });
});

export const listProjects = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, target_url, verified_at, verify_method, paused, probe_interval_s, created_at
       FROM projects WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({ projects: rows });
});

export const getProject = asyncHandler(async (req, res) => {
  const project = await ownedProject(req.params.id, req.user.id);
  res.json({ project });
});

// Run ownership verification now. On success, mark verified and enqueue the
// first probe. This is the gate: probes only start after this passes.
export const verifyProject = asyncHandler(async (req, res) => {
  const project = await ownedProject(req.params.id, req.user.id);
  if (project.verified_at) return res.json({ verified: true, method: project.verify_method });

  const result = await verifyOwnership(project.target_url, project.verify_token);
  if (!result.ok) throw new ApiError(422, `ownership not verified: ${result.detail}`);

  await query(`UPDATE projects SET verified_at = now(), verify_method = $2 WHERE id = $1`, [
    project.id,
    result.method,
  ]);
  await enqueueProbe(project.id);
  res.json({ verified: true, method: result.method });
});

// Emergency stop / resume. Pausing halts all future probes immediately.
export const setPaused = asyncHandler(async (req, res) => {
  const project = await ownedProject(req.params.id, req.user.id);
  const paused = Boolean(req.body?.paused);
  await query(`UPDATE projects SET paused = $2 WHERE id = $1`, [project.id, paused]);
  if (!paused && project.verified_at) await enqueueProbe(project.id);
  res.json({ paused });
});

export const recentProbes = asyncHandler(async (req, res) => {
  const project = await ownedProject(req.params.id, req.user.id);
  const { rows } = await query(
    `SELECT ok, status_code, latency_ms, error, contract_ok, contract_violations, created_at
       FROM probes WHERE project_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [project.id]
  );
  res.json({ probes: rows });
});

// Snapshot the current window into a signed, publicly shareable report.
export const createReport = asyncHandler(async (req, res) => {
  const project = await ownedProject(req.params.id, req.user.id);
  const windowHours = parseInt(req.body?.window_hours || '168', 10);
  const report = await generateReport(project, windowHours);
  res.status(201).json({
    report,
    public_url: `${env.PUBLIC_BASE_URL}/r/${report.public_id}`,
  });
});
