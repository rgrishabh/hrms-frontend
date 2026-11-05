# hrms-frontend

HRMS web app: React 19 and Vite 8, served by unprivileged nginx. The API is [hrms-backend](https://github.com/rgrishabh/hrms-backend). Environments and pipelines are in [hrms-deployment](https://github.com/rgrishabh/hrms-deployment), whose `docs/CONFIGURATION.md` is the contract for every setting.

## Start developing

You need Node 22 or newer, and the backend running on `:4000` (see its README: `npm run migrate && npm run seed && npm run dev`).

```bash
npm ci
npm run dev        # http://localhost:5173, proxying /api and /brand to :4000
```

Sign in with the seed's administrator, printed by the backend's seed.

## Commands

| Command | Does |
|---|---|
| `npm run lint` | Types, including e2e, then ESLint with no warnings allowed |
| `npm test`, `npm run test:coverage` | Unit tests, and the same with thresholds enforced |
| `npm run build` | Type check and production bundle |
| `npm run check:bundle` | Fails if initial JS is over 200 KB gzip |
| `npm run api:generate`, `npm run api:check` | API types from the backend's `openapi.json`, and the check that they match |
| `npm run e2e` | Full stack in a browser. See below |
| `npm run e2e:mock` | Production build with a mocked API: layout, CSP, contrast, service worker |
| `npm run e2e:visual` | Visual baselines on fixed fixtures |

ESLint and the type generator live in `tools/lint` with their own `node_modules`, because they need the TypeScript 5 API and the app builds with TypeScript 7. The scripts install them on first use.

## The API client

`src/api.ts` is the one path to the server. It holds the CSRF token in memory, keeps the rotated token any response carries, and turns every failure into an `ApiError`. `errorMessage` and `ApiError.fieldErrors` are what screens show: field errors, `weak_password` reasons, `Retry-After` waits, `malware_detected`, `scanner_unavailable` and `requires_higher_level` all come from there.

Types come from `src/lib/api-schema.gen.ts`, read through `ApiResponse`, `ApiBody` and `ApiQuery` in `src/lib/api-types.ts`. **About 290 of the 385 API routes have no response schema yet**, so those answer `never`, and a narrow hand-written type sits beside the screen that uses them. `src/lib/api-contract.test.ts` fails if any call in the app is not a route in the spec. To update after a backend change:

```bash
HRMS_OPENAPI=../hrms-backend/openapi.json npm run api:generate   # in the backend: npm run openapi
```

Masked data: L4 fields answer null with `masked` and `maskedFields` unless the request has `?reveal=1`, which is audited. Use `useRevealable` and `RevealToggle`, or `MaskedValue` for one value, from `src/lib/masking.ts` and `src/components`.

## Full-stack tests

`e2e/full/stack.mjs` starts it all: a migrated database with the backend's synthetic demo data, the API and worker from a backend checkout, a small SMTP sink for invitation and code mail, and this build. Playwright starts it for you. It needs Postgres 17 with roles `hrms_owner` and `hrms_app` and an **empty, disposable** database named `hrms_e2e`. The script drops its schema, and refuses any other name.

```bash
npm run build
export E2E_DB_OWNER_URL=postgres://hrms_owner:…@127.0.0.1:5432/hrms_e2e
export E2E_DB_APP_URL=postgres://hrms_app:…@127.0.0.1:5432/hrms_e2e
export E2E_BACKEND_DIR=../hrms-backend              # the default
npm run e2e                                          # desktop and 360px, everything on
E2E_PROFILE=off npm run e2e                          # most flags off, MFA off
E2E_PROFILE=single npm run e2e                       # ORG_MANAGEMENT_MODE=single
```

Between profiles, stop the first stack: Playwright reuses a running one locally. Run one profile at a time.

| Specs | Covers |
|---|---|
| `e2e/full/walk.full.ts` | Every screen as someone it is for: no failed request, no crash, no error on screen, axe clean |
| `e2e/full/auth.full.ts` | Invitations, weak passwords, reset, email and authenticator MFA, sessions, CSRF rotation, back-off |
| `e2e/full/journeys.full.ts` | Attendance, employee create, payroll to payslip PDF, settings, users |
| `e2e/*.e2e.ts` | Older flows per module, including leave |
| `e2e/full/*.off.ts`, `*.single.ts` | Flags off and the smaller mode |

Visual baselines are per platform, in `e2e/mock/__screenshots__`. To update the Linux ones CI uses, run in the Playwright image with the repo mounted: `docker run --rm -v "$PWD":/w -w /w mcr.microsoft.com/playwright:v1.64.1-noble sh -c 'npm ci && npm run build && npm run e2e:visual -- --update-snapshots'`.

## Rebranding needs no rebuild

Two things carry the brand, and neither is built in:

- `/api/v1/config/public`: name, logo, colours, font, locale, currency, date format and feature flags, applied at runtime by `src/lib/brand.ts`.
- `docker/40-hrms-runtime.sh`: at container start it renders the title, theme colour, favicon, description, manifest, icon and CSP into `/tmp/hrms` from `BRAND_*` variables. So a browser has the right name before any script runs.

`BRAND_FONT_FAMILY` must be **Inter**, **Source Sans 3** or **Noto Sans**, the fonts bundled with the build, because the CSP allows only `font-src 'self'`. Any other name is ignored and Inter stays. Adding a font means a release.

## Same origin as the API

Authentication uses a session cookie and a CSRF header, so the app and the API must share an origin. The reverse proxy in every environment sends `/api/*`, `/health*`, `/ready` and `/brand/*` to the backend and the rest to this container: Caddy in dev, ALB rules in production.

## More

- `docs/DESIGN.md`: components, patterns and the decisions behind them. Screens use these; there is no second look.
- `QA_REPORT.md`: bugs found and fixed. `AUDIT.md`: where the revamp began. `CHANGELOG.md`: what changed and what was removed.
- `.github/workflows`: `ci`, `e2e`, `lighthouse`, `security`, `publish-develop` and `release`. Publishing goes through `_app-publish.yml` in hrms-deployment, whose signing identity production verifies.
