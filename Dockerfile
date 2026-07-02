FROM node:20-alpine

WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY server ./server

WORKDIR /app/server
EXPOSE 8001
CMD ["node", "src/index.js"]
