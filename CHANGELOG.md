# Changelog

## Unreleased

### Removed

* SMS: settings page, account preference, e2e spec and the CI variables.
* `GET /api/v1/public/config`: the app reads `GET /api/v1/config/public`. `me.capabilities` is replaced by `features` from that endpoint.
* The `{ error: { ... } }` response shape: only RFC 7807 is read.
* `style-src 'unsafe-inline'` from the CSP.
* `BRAND_SHORT_NAME`, and the unused `brandShortName` in `env.js`. `PRODUCT_NAME` remains as a fallback for `BRAND_PRODUCT_NAME`.
* The theme-independent brand gradient on the sign-in page.

## [1.1.0](https://github.com/rgrishabh/hrms-frontend/compare/v1.0.0...v1.1.0) (2026-11-04)


### Features

* runtime env.js with environment badge and early branding ([d030a6f](https://github.com/rgrishabh/hrms-frontend/commit/d030a6f511b8b0ca53533f0337800aa23f2b0f8a))
* **web:** HRMS web app ([99d8c43](https://github.com/rgrishabh/hrms-frontend/commit/99d8c4314a3d95605338ea6b67d67f79ee187fc9))


### Bug Fixes

* **docker:** nginx 1.31 base and apk upgrade (CVE-2026-111497 brotli, curl, expat, openssl) ([7af5fe4](https://github.com/rgrishabh/hrms-frontend/commit/7af5fe432aa3e1f9285227ce4e86dc455c461e3a))
* **settings:** absolute tab links so the URL no longer grows on every click ([#5](https://github.com/rgrishabh/hrms-frontend/issues/5)) ([82fa7e7](https://github.com/rgrishabh/hrms-frontend/commit/82fa7e72063ec6d4394dc86111210454e62fbe35))
