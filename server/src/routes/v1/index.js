import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth.js';
import * as auth from '../../controllers/auth.controller.js';
import * as projects from '../../controllers/projects.controller.js';
import * as campaigns from '../../controllers/campaigns.controller.js';

const router = Router();

// Tighter limit on auth to slow credential stuffing.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true });

router.post('/auth/register', authLimiter, auth.register);
router.post('/auth/login', authLimiter, auth.login);
router.get('/auth/me', requireAuth, auth.me);

router.get('/projects', requireAuth, projects.listProjects);
router.post('/projects', requireAuth, projects.createProject);
router.get('/projects/:id', requireAuth, projects.getProject);
router.post('/projects/:id/verify', requireAuth, projects.verifyProject);
router.post('/projects/:id/pause', requireAuth, projects.setPaused);
router.get('/projects/:id/probes', requireAuth, projects.recentProbes);
router.post('/projects/:id/reports', requireAuth, projects.createReport);

router.post('/projects/:id/campaigns', requireAuth, campaigns.createCampaign);
router.get('/projects/:id/campaigns', requireAuth, campaigns.listCampaigns);
router.get('/projects/:id/campaigns/:campaignId', requireAuth, campaigns.getCampaign);

export default router;
