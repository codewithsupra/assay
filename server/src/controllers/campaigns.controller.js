import { query } from '../config/db.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import * as campaigns from '../services/campaigns.js';

async function ownedProject(projectId, userId) {
  const { rows } = await query(`SELECT * FROM projects WHERE id = $1 AND user_id = $2`, [
    projectId,
    userId,
  ]);
  if (!rows[0]) throw new ApiError(404, 'project not found');
  return rows[0];
}

export const createCampaign = asyncHandler(async (req, res) => {
  const project = await ownedProject(req.params.id, req.user.id);
  const campaign = await campaigns.requestCampaign(project, req.body || {});
  res.status(201).json({ campaign });
});

export const listCampaigns = asyncHandler(async (req, res) => {
  const project = await ownedProject(req.params.id, req.user.id);
  res.json({ campaigns: await campaigns.listCampaigns(project.id) });
});

export const getCampaign = asyncHandler(async (req, res) => {
  const project = await ownedProject(req.params.id, req.user.id);
  const campaign = await campaigns.getCampaign(req.params.campaignId, project.id);
  if (!campaign) throw new ApiError(404, 'campaign not found');
  res.json({ campaign });
});
