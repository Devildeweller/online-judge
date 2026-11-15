# Static build of the React app served by nginx, which also proxies /api and /socket.io.
# Build context is the repository root:  docker build -f web/Dockerfile -t oj-web .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspace web --include-workspace-root --no-audit --no-fund
COPY web web
RUN npm run build --workspace web

FROM nginx:1.29-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
