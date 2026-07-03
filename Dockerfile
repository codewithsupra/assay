FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY server ./server
COPY --from=client-build /app/client/dist ./client/dist

WORKDIR /app/server
EXPOSE 8001
CMD ["node", "src/index.js"]
