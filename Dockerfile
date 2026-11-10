# syntax=docker/dockerfile:1.7
# HRMS frontend: static SPA on nginx (unprivileged, :8080). Runtime config (title, theme,
# favicon, env.js, CSP) is rendered at container start; no rebuild per environment/customer.

FROM node:25-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31-alpine
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="hrms-frontend" \
      org.opencontainers.image.source="https://github.com/rgrishabh/hrms-frontend" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"
ENV APP_VERSION=${VERSION}
# Security fixes published after the base image was built (Trivy gate is CRITICAL).
USER root
# hadolint ignore=DL3018
RUN apk upgrade --no-cache
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 docker/40-hrms-runtime.sh /docker-entrypoint.d/40-hrms-runtime.sh
COPY --from=build /src/dist /usr/share/nginx/html
# The generated /env.js and /index.html replace the build-time copies.
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD ["wget", "-qO", "/dev/null", "http://127.0.0.1:8080/healthz"]
