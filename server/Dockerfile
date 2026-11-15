# Image for both the API and the judge worker. Build context is the repository root:
#   docker build -f server/Dockerfile -t oj-server .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspace server --include-workspace-root --no-audit --no-fund
COPY server server
RUN npm run build --workspace server

FROM node:24-alpine
# docker-cli lets the worker drive the host daemon through the mounted socket.
RUN apk add --no-cache docker-cli tini wget
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/server
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/api/index.js"]
