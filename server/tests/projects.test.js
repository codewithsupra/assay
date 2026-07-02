import { jest } from '@jest/globals';
import http from 'node:http';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { resetDb, makeUserAndToken } from './setup.js';

const app = createApp();

// A real local target the tests control: it can serve the verify token and
// toggle health, exactly like Pulse's incident-lifecycle test target.
let target;
let targetUrl;
let served = { token: null, healthy: true };

beforeAll(async () => {
  await resetDb();
  target = http.createServer((req, res) => {
    if (req.url === env.VERIFY_PATH) {
      if (served.token) return res.end(served.token);
      res.statusCode = 404;
      return res.end('no token');
    }
    if (req.url === '/api/ping') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ pong: true }));
    }
    res.statusCode = served.healthy ? 200 : 503;
    res.end('ok');
  });
  await new Promise((r) => target.listen(0, r));
  targetUrl = `http://127.0.0.1:${target.address().port}`;
});

afterAll(async () => {
  await new Promise((r) => target.close(r));
  await pool.end();
});

describe('projects + consent gate', () => {
  let token;
  beforeAll(async () => {
    ({ token } = await makeUserAndToken(request, app, 'owner@x.com'));
  });

  test('create returns verification instructions and stays unverified', async () => {
    const res = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'My API', target_url: targetUrl, endpoint_spec: [{ path: '/api/ping', expectStatus: 200, expectJsonKeys: ['pong'] }] });
    expect(res.status).toBe(201);
    expect(res.body.project.verified_at).toBeNull();
    expect(res.body.verification.http.expected_body).toMatch(/^assay-verify-/);
  });

  test('verify fails until the token is served, then succeeds (HTTP method)', async () => {
    const create = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Gate', target_url: targetUrl });
    const id = create.body.project.id;
    const expectedToken = create.body.verification.http.expected_body;

    served.token = null;
    const fail = await request(app)
      .post(`/api/v1/projects/${id}/verify`)
      .set('Authorization', `Bearer ${token}`);
    expect(fail.status).toBe(422);

    served.token = expectedToken;
    const ok = await request(app)
      .post(`/api/v1/projects/${id}/verify`)
      .set('Authorization', `Bearer ${token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.method).toBe('http');

    // A probe job must now exist (probing only starts after verification).
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM jobs WHERE project_id = $1`, [id]);
    expect(rows[0].n).toBeGreaterThan(0);
  });

  test('another user cannot see or verify my project', async () => {
    const { token: other } = await makeUserAndToken(request, app, 'intruder@x.com');
    const create = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Private', target_url: targetUrl });
    const id = create.body.project.id;

    const get = await request(app).get(`/api/v1/projects/${id}`).set('Authorization', `Bearer ${other}`);
    expect(get.status).toBe(404);
    const verify = await request(app).post(`/api/v1/projects/${id}/verify`).set('Authorization', `Bearer ${other}`);
    expect(verify.status).toBe(404);
  });
});
