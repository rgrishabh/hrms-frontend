# hrms-frontend

HRMS web app: React 19 + Vite 8 SPA, served by nginx (unprivileged) in production.
API: [hrms-backend](https://github.com/rgrishabh/hrms-backend) · environments and pipelines: [hrms-deployment](https://github.com/rgrishabh/hrms-deployment).

## Develop

```bash
npm ci
npm run dev        # http://localhost:5173 — proxies /api, /brand, /branding to the backend on :4000
npm run lint && npm test && npm run build
```

## Browser end-to-end tests

Playwright tests in `e2e/` drive the real app as the backend's demo personas (analyst, lab manager,
HR head, payroll, IT): every menu page per role, the performance review from self-review to
acknowledgement, issuing / returning a calibrated instrument, reports (HR grouping and CSV
download, a manager limited to their own team), the dashboard (tiles per role that agree with
the reports they open), leave from application through manager approval to cancellation, a
returned request with a required reason, and an expense claim from receipt upload through manager
and finance approval, a maker–checker payment batch and payment, and recruitment from a manager's
requisition through candidate, interview feedback, offer and management sign-off to the hire. The flows clean up after
themselves (or use unique names and free dates), so the suite can be re-run on the same data. They need an installation loaded
with the backend's **synthetic** demo data (`npm run demo` in hrms-backend) and `MFA_ENFORCEMENT=off`.

```bash
E2E_PASSWORD='<from the demo output>' npm run e2e          # against http://localhost:5173 (vite + local API)
```

CI (`.github/workflows/e2e.yml`) does the same on every pull request: a throwaway Postgres, the
`hrms-backend:develop` image, demo data, and this repo's production build. Tests are written to be
re-runnable on the same data.

## Same origin as the API

Authentication uses a session cookie plus a CSRF header, so the SPA and the API must be served from the **same origin**.
The reverse proxy in every environment routes `/api/*`, `/health*`, `/ready`, `/brand/*` and `/branding/*` to the backend and everything
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
