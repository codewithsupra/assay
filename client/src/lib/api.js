const TOKEN_KEY = 'assay_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `request failed (${res.status})`);
  return data;
}

export const api = {
  register: (body) => request('/auth/register', { method: 'POST', body, auth: false }),
  login: (body) => request('/auth/login', { method: 'POST', body, auth: false }),
  me: () => request('/auth/me'),

  listProjects: () => request('/projects'),
  createProject: (body) => request('/projects', { method: 'POST', body }),
  getProject: (id) => request(`/projects/${id}`),
  verifyProject: (id) => request(`/projects/${id}/verify`, { method: 'POST' }),
  setPaused: (id, paused) => request(`/projects/${id}/pause`, { method: 'POST', body: { paused } }),
  recentProbes: (id) => request(`/projects/${id}/probes`),
  createReport: (id, windowHours) =>
    request(`/projects/${id}/reports`, { method: 'POST', body: { window_hours: windowHours } }),

  createCampaign: (id, body) => request(`/projects/${id}/campaigns`, { method: 'POST', body }),
  listCampaigns: (id) => request(`/projects/${id}/campaigns`),
  getCampaign: (id, campaignId) => request(`/projects/${id}/campaigns/${campaignId}`),
};

export { ApiError };
