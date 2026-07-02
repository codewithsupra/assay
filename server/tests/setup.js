import { pool } from '../src/config/db.js';
import { migrate } from '../src/db/migrate.js';

export async function resetDb() {
  await migrate();
  await pool.query('TRUNCATE users, projects, jobs, probes, reports CASCADE');
}

export async function makeUserAndToken(request, app, email = 'a@b.com') {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, name: 'Test', password: 'password123' });
  return { token: res.body.token, user: res.body.user };
}
