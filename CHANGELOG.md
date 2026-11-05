# Changelog

## Unreleased

### Removed

* SMS: settings page, account preference, e2e spec and the CI variables.
* `GET /api/v1/public/config`: the app reads `GET /api/v1/config/public`. `me.capabilities` is replaced by `features` from that endpoint.
* The `{ error: { ... } }` response shape: only RFC 7807 is read.
* `style-src 'unsafe-inline'` from the CSP.
* `BRAND_SHORT_NAME`, and the unused `brandShortName` in `env.js`. `PRODUCT_NAME` remains as a fallback for `BRAND_PRODUCT_NAME`.
* The theme-independent brand gradient on the sign-in page.
* `src/ui.tsx`, `src/styles/legacy.css`, `useLoad` and the old `EmployeePicker`: every screen is on `src/components`.
* `hasModule` and the module key table, including `advances_loans`: pages use `FEATURE_*` flags, with `FEATURE_LOANS` and `FEATURE_SALARY_ADVANCE` separate.
* `ApiError.details` and the `any` defaults on the API client: an untyped call now returns `unknown`.
* Opening a record by clicking its table row: a link in the first cell does it, and works from the keyboard.
* Direct download links: `DownloadButton` fetches the file, so a failure stays on the page as a message. The file still arrives as a normal browser download.
* Lab wording outside `FEATURE_LAB_COMPETENCY`: asset categories and calibration labels, field duty sampling. With the flag off the labels read "Service due" and "Field work". API fields and values are unchanged.
* "Within India" as a travel option label, now "Domestic".
* `ASSET_CATEGORY` and the `fmtCell` export from Reports.
* The "attendance setup" banner and its `tenant/installation` call: the Biometric tab now needs `FEATURE_ATTENDANCE_BIOMETRIC`.
* `initialPassword` on Add user: people choose their own from an invitation.
* "Print or save as PDF" on payslips: the server's PDF replaces the browser's print.
* "Show masked details" on bank details: a masked answer writes no audit row, so it loads at once and only showing the details is asked for.
* "Request again" on a returned trip: Correct and resubmit replaces it, on the same request.
* The `outstanding` figure in the repayment toast, as the API no longer sends it.
* The `/branding` dev proxy, and `E2E_DOMAIN`, `E2E_BASE_URL` and the old backend environment in `e2e.yml`.
* The shared `_app-ci.yml` from this repo's CI. Its jobs are now in `ci.yml` and `security.yml`.
* `src/test/pageApi.tsx` and `src/test/pageHarness.tsx`, merged into `src/test/page.tsx`.

### Changed

* `PUT employees/:id/bank-account` is a proposal: the toast says it was sent for approval, and the profile shows the change waiting.
* Marking an employee as exited asks for an exit date.
* Tenant jobs are queued: the toast says so and Settings follows the run until it finishes.
* The push toggle uses the real `/notifications/push/{public-key,subscribe,unsubscribe}` routes.
* `Permissions-Policy` now allows `camera=(self)`, needed for the clock-in selfie. It was `camera=()`.

### Added

* API types generated from the backend's `openapi.json` (`npm run api:generate`, checked by `npm run api:check`), and a test that every call in the app is a route in the spec.
* One path for problems in `src/api.ts`: `weak_password` reasons, `Retry-After`, `malware_detected`, `scanner_unavailable`, `requires_higher_level`, and CSRF rotation from any answer that carries a token.
* Auth: email codes and method choice from `/auth/mfa/methods`, `mfa_locked`, forgot and reset password, invitations at `/setup`, session list and revoke, and a notice after the server ends a session.
* Users: invitations, resend and reset links, Invited status, salary level. Roles by mode, since `/tenant/roles` answers 404 in the smaller modes.
* L4 masking with `useRevealable`, `RevealToggle` and `Money masked`; `?reveal=1` on payroll, payslips, salaries, statutory, bank, loans, F&F, reports, accounting, recruitment and company. L3 reasons and masked phone and date of birth. Directory and team views of employees.
* Settings: Company with signature and stamp, Data retention, Data rights with erasure and exports, Audit chain with verify, Grades and Designations.
* Stuck approvals, resubmit for returned trips, clock-in selfie for HR, `released_count` on the bank file, PDF payslips, letters with an includePay choice, report PDFs, `total` on inbox and my requests, payroll-related document categories, and a Payroll view.
* Full-stack browser tests (`e2e/full`), Axe on every screen against the real API, visual baselines, ESLint, coverage thresholds, CI for lint, types, drift, E2E, Lighthouse, Trivy, SBOM, Semgrep, CodeQL and Gitleaks.
* Clock-in with camera selfie (`FEATURE_ATTENDANCE_SELFIE`) and geofence messages (`FEATURE_ATTENDANCE_GEOFENCE`), on My attendance and the dashboard. Geofences tab in Attendance setup.
* Payroll: reopen an approved run, release held pay, the released-pay bank file, and F&F suggestions from a picked employee, with leave year.
* Recruitment: edit an offer. Onboarding: cancel a checklist. Competency: cancel an authorization. Policies: edit details. Approvals: reassign. Leave: balance history. Cases: "Assigned to me".
* `Money`, the one path for amounts on screen, plus `useSubmit`, `useAction`, `FormActions`, `DownloadButton`, `EmployeeField`, `useOrg`, and an undo action on toasts.
* Browser validation messages now show inline at the field, with focus on the first problem.

## [1.1.0](https://github.com/rgrishabh/hrms-frontend/compare/v1.0.0...v1.1.0) (2026-11-04)


### Features

* runtime env.js with environment badge and early branding ([d030a6f](https://github.com/rgrishabh/hrms-frontend/commit/d030a6f511b8b0ca53533f0337800aa23f2b0f8a))
* **web:** HRMS web app ([99d8c43](https://github.com/rgrishabh/hrms-frontend/commit/99d8c4314a3d95605338ea6b67d67f79ee187fc9))


### Bug Fixes

* **docker:** nginx 1.31 base and apk upgrade (CVE-2026-111497 brotli, curl, expat, openssl) ([7af5fe4](https://github.com/rgrishabh/hrms-frontend/commit/7af5fe432aa3e1f9285227ce4e86dc455c461e3a))
* **settings:** absolute tab links so the URL no longer grows on every click ([#5](https://github.com/rgrishabh/hrms-frontend/issues/5)) ([82fa7e7](https://github.com/rgrishabh/hrms-frontend/commit/82fa7e72063ec6d4394dc86111210454e62fbe35))
