import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/config/db.js';
import { resetDb, makeUserAndToken } from './setup.js';

const app = createApp();

beforeAll(resetDb);
afterAll(() => pool.end());

describe('auth', () => {
  test('registers and returns a token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'reg@x.com', name: 'Reg', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('reg@x.com');
  });

  test('rejects weak password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'weak@x.com', name: 'W', password: 'short' });
    expect(res.status).toBe(400);
  });

  test('rejects duplicate email', async () => {
    await makeUserAndToken(request, app, 'dup@x.com');
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'dup@x.com', name: 'D', password: 'password123' });
    expect(res.status).toBe(409);
  });

  test('login works and /me requires auth', async () => {
    await makeUserAndToken(request, app, 'login@x.com');
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@x.com', password: 'password123' });
    expect(login.status).toBe(200);

    const noauth = await request(app).get('/api/v1/auth/me');
    expect(noauth.status).toBe(401);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('login@x.com');
  });
});
