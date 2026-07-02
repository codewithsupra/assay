import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';

// Live campaign progress, isolated in its own module so swapping in the
// Socket.io Redis adapter for multi-node deploys later touches only this
// file — same reasoning as Pulse's src/sockets/io.js.
let io = null;

export function initIo(httpServer) {
  io = new Server(httpServer, { cors: { origin: '*' } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('missing token'));
    try {
      const payload = jwt.verify(token, env.JWT_SECRET);
      socket.userId = payload.sub;
      next();
    } catch {
      next(new Error('invalid token'));
    }
  });

  io.on('connection', (socket) => {
    // Only the owner may subscribe to a project's live room -- progress
    // events can include error rates and target details, so this isolation
    // matters as much as it does on the REST side.
    socket.on('subscribe', async (projectId) => {
      if (typeof projectId !== 'string') return;
      const { rows } = await query(`SELECT 1 FROM projects WHERE id = $1 AND user_id = $2`, [
        projectId,
        socket.userId,
      ]);
      if (rows[0]) socket.join(`project:${projectId}`);
    });
  });

  return io;
}

export function emitProgress(projectId, event, data) {
  io?.to(`project:${projectId}`).emit(event, data);
}
