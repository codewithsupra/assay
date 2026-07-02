import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { signToken } from '../middleware/auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const register = asyncHandler(async (req, res) => {
  const { email, name, password } = req.body || {};
  if (!EMAIL_RE.test(email || '')) throw new ApiError(400, 'valid email required');
  if (!name || name.length < 1) throw new ApiError(400, 'name required');
  if (!password || password.length < 8) throw new ApiError(400, 'password must be at least 8 characters');

  const hash = await bcrypt.hash(password, 10);
  let rows;
  try {
    ({ rows } = await query(
      `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       RETURNING id, email, name, created_at`,
      [email.toLowerCase(), name, hash]
    ));
  } catch (err) {
    if (err.code === '23505') throw new ApiError(409, 'email already registered');
    throw err;
  }
  const user = rows[0];
  res.status(201).json({ user, token: signToken(user) });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw new ApiError(400, 'email and password required');
  const { rows } = await query(
    `SELECT id, email, name, password_hash FROM users WHERE email = $1`,
    [String(email).toLowerCase()]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new ApiError(401, 'invalid credentials');
  }
  const safe = { id: user.id, email: user.email, name: user.name };
  res.json({ user: safe, token: signToken(safe) });
});

export const me = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, email, name, created_at FROM users WHERE id = $1`,
    [req.user.id]
  );
  if (!rows[0]) throw new ApiError(404, 'user not found');
  res.json({ user: rows[0] });
});
