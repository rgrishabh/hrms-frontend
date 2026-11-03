# hrms-frontend

HRMS web app: React 19 + Vite 8 SPA, served by nginx (unprivileged) in production.
API: [hrms-backend](https://github.com/rgrishabh/hrms-backend) · environments and pipelines: [hrms-deployment](https://github.com/rgrishabh/hrms-deployment).

## Develop

```bash
npm ci
npm run dev        # http://localhost:5173 — proxies /api, /health, /ready, /branding to the backend on :4000
npm run lint && npm test && npm run build
```

## Same origin as the API

Authentication uses a session cookie plus a CSRF header, so the SPA and the API must be served from the **same origin**.
The reverse proxy in every environment routes `/api/*`, `/health*`, `/ready` and `/branding/*` to the backend and everything
else to this container (Caddy in dev, ALB listener rules in prod). nginx returns 404 for those paths if they ever reach it.

## Image

`ghcr.io/rgrishabh/hrms-frontend:<tag>` listens on `:8080` as uid 101 with a read-only root filesystem (needs a writable `/tmp`).
At start, `docker/40-hrms-runtime.sh` renders from environment variables ([.env.example](.env.example)):

- `index.html` with the installation's title, theme colour and favicon (no unbranded flash);
- `/env.js` (`window.__HRMS_ENV__`: environment, version, product name) — non-secret only;
- security headers: CSP (`script-src 'self'`, external logo origin allowed in `img-src` only), nosniff, frame denial, HSTS.

Hashed assets under `/assets/` are cached for a year; `index.html` and `env.js` are never cached. Liveness: `GET /healthz`.

## Branches and releases

Same flow as the backend: PR → `develop` (CI + PR comment) → auto-deploy to dev; `develop` → `main` → release-please PR → `vX.Y.Z` → production version PR in hrms-deployment.
Conventional Commits are required.
