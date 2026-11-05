# HRMS frontend audit

Branch `feature/hrms-revamp`, commit `bc9461a`, audited 2026-11-05.

**Method.** Static reading of every source file, plus `npm run build`, `npm test` and `npm audit --omit=dev`. Endpoints were checked by script against backend route files. The app was not opened in a browser and Playwright was not run (it needs a backend with demo data). Claims about layout, overflow and focus are traced from code and CSS, so check them in a browser before relying on them. Section 9 lists what remains unverified.

Paths are relative to the repo root unless prefixed `backend:` or `deployment:`. Bare `Page.tsx:n` means `src/pages/Page.tsx:n`.

## Top 10

| # | Issue | Evidence |
|---|---|---|
| 1 | A failed first load blanks the whole app. `data` is null and dereferenced, and there is no ErrorBoundary | `Leave.tsx:46`, `Payslips.tsx:15`, `Payroll.tsx:52`, `Settings.tsx:264`, `Cases.tsx:107`; 32 sites in §4.1 |
| 2 | No route guards; pages must gate themselves and many do not | `src/main.tsx:316-346`, `Settings.tsx:33-42` |
| 3 | The mobile drawer cannot be dismissed without navigating | `src/styles.css:53`, `src/main.tsx:233,292` |
| 4 | Editing a requisition opens the form underneath the detail modal | `Recruitment.tsx:97-98,152-154` |
| 5 | Money and security actions run on one click: finalize payroll, rotate device key, reset 2FA | `Payroll.tsx:102`, `AttendanceAdmin.tsx:182`, `Settings.tsx:311` |
| 6 | Clickable table rows have no keyboard path; claims and policies have no other way in | `Expenses.tsx:49`, `Policies.tsx:41`, 14 more in §6.4 |
| 7 | 792 KB single bundle, and production very likely serves it uncompressed | `dist/assets/index-*.js`, `docker/nginx.conf`, `deployment:terraform/modules/hrms-stack/edge.tf:98` |
| 8 | Dark mode fails contrast on links, active nav and error toasts | `src/styles.css:24-29`; §6.4 |
| 9 | Failed loads read as "nothing here" on many screens | `Leave.tsx:60`, `Cases.tsx:49`, `Approvals.tsx:58`, `Expenses.tsx:201,210` |
| 10 | No double-submit protection on most forms, including complaints and pay adjustments | `Cases.tsx:91`, `Payroll.tsx:128`, `Expenses.tsx:67` |

---

## 1. Stack, structure, how it runs

**Versions (installed).** React and react-dom 19.3.1, react-router-dom 7.18.5, Vite 8.3.5, TypeScript 7.0.2, Vitest 5.1.0, Playwright 1.64.1, qrcode 1.5.4, `@vitejs/plugin-react` 6.2.1. Node >= 22. No state library, data-fetching library, CSS framework or linter.

```text
index.html              head marker + /env.js + module entry
public/env.js           dev default for window.__HRMS_ENV__
src/main.tsx      356   entry; Login, Setup, Account, Shell, nav, all routes
src/api.ts         49   fetch wrapper, CSRF, ApiError, qs
src/auth.tsx       95   AuthProvider, applyBrand, can/canAny/hasModule
src/ui.tsx        125   shared components and useLoad
src/format.ts      70   date/money formatting, status labels
src/Mfa.tsx        79   verify, enrol, recovery codes
src/runtime/env.ts 15   env.js reader (1 test file, 3 tests)
src/styles.css    160   all CSS, one global file
src/pages/*.tsx         32 page files
e2e/                    21 specs + helpers.ts
docker/                 nginx.conf, 40-hrms-runtime.sh
```

**Running it.**
- Dev: `npm run dev` on `:5173`, proxying `/api`, `/health`, `/ready`, `/branding` to `:4000` (`vite.config.ts:8-17`).
- Production: multi-stage Docker build into `nginx-unprivileged:1.31-alpine` on `:8080`, uid 101, read-only root with writable `/tmp`.
- At container start `docker/40-hrms-runtime.sh` renders `index.html`, `env.js` and the security headers into `/tmp/hrms`.
- SPA and API must share an origin (session cookie plus CSRF header). Caddy routes this in dev (`deployment:environments/dev/Caddyfile`), an ALB in production.

**Code shape.** 332 `api.*` calls, 161 `useLoad` calls, 343 `any` annotations, 452 inline `style={{}}` attributes, 94 tables. Lines are long and dense, so 7.5k lines is about 580 KB of source.

---

## 2. Screens and status

No screen is dead: every page file is imported and routed or embedded. Status definitions: **complete** = main flows work when APIs succeed; **partial** = a flow cannot finish or a backend capability has no UI; **broken** = a traced defect stops the main use. Nearly all screens also carry the crash in §4.1, which is not repeated here.

| Screen | Route | Status | Notes |
|---|---|---|---|
| Login | `/` signed out | complete | `main.tsx:77-98` |
| Admin setup | `/setup#token=` | complete | Token in fragment and cleared (`main.tsx:103,107`); no busy flag |
| MFA verify / enrol | guards in `App` | complete | `main.tsx:310-312`, `Mfa.tsx` |
| Forced password change | guard in `App` | complete | `main.tsx:313` |
| My account | `/account` | complete | SMS card to remove; "Sign out everywhere" has no error handling (`main.tsx:174`) |
| Dashboard | `/` | complete | Inbox, mine, policy errors swallowed (`Dashboard.tsx:109-113`) |
| Notifications | `/notifications` | complete | Crash `:24` |
| My profile | `/profile` | complete | Validation server-only |
| My attendance | `/attendance/me` | partial | New request not shown until remount (`:85,:121`); pre-fills invented 09:30/18:00 (`:92-95`) |
| Team attendance | `/attendance/team` | complete | Status filter lists non-attendance values (`:29`, `format.ts:62-63`) |
| Roster | `/attendance/roster` | complete | Clearing cycle length truncates days (`Rosters.tsx:97,113`) |
| Attendance setup: shifts, holidays, locks | `/attendance/admin` | complete | No unlock path in UI or backend routes |
| Attendance setup: devices | same | complete | Rotate key unconfirmed; key modal can be lost (`:182,:218`) |
| Attendance setup: rosters | same tab | complete | Crash if shifts fail (`Rosters.tsx:213,222`) |
| Approvals: inbox, mine, away | `/approvals` | complete | Mine hides errors (`:58`) |
| Leave: mine, team, admin | `/leave?tab=` | complete | 29-column team grid (`:157`) |
| Overtime | `/overtime` | complete | List capped at 50, no pager (`:33`) |
| Field duty | `/field-duty` | complete | Same cap (`:38`) |
| Travel | `/travel` | partial | Returned trips dead-end: no edit or resubmit in UI or backend (`:58-61`) |
| Advances and loans | `/loans` | complete | Cap 50 (`:32`); Defer lacks own-check (`:154`) |
| Expenses: all tabs | `/expenses?tab=` | complete | Finance tab has no loading or error state (`:194,201,210`) |
| Allowance rates | Expenses tab | complete | Hard-coded ₹ (`AllowanceRates.tsx:63`) |
| Payslips | `/payslips` | complete | No page gate; 403 crashes (`:15`) |
| Payroll: runs, salaries, components, statutory | `/payroll?tab=` | partial | F&F run needs a raw employee UUID (`:69`); `fnf-suggestions` unused; base codes hard to type (`:260`); stale statutory data (`:171-172,194-196`) |
| Accounting | `/accounting` | complete | Ledger map has no empty state (`:101`) |
| Employees list | `/employees` | complete | Crash path differs: ErrorBox plus Empty (`:40-41`) |
| Employee profile | `/employees/:id` | partial | `confirmationDate` carried but has no input (`:83,98`); unknown `?tab=` gives blank body (`:287-290`) |
| Documents | `/documents` | complete | Failed load shows spinner forever (`:89-90`) |
| Recruitment: requisitions | `/recruitment` | **broken (edit only)** | Form under detail modal; stale version then 409 (`:97-98`) |
| Recruitment: candidates, interviews, offers | same | partial | `PUT /offers/:id` has no caller, so offers cannot be edited; org load failure leaves permanent Loading (`:41`) |
| Onboarding and exit | `/lifecycle?tab=` | partial | Exit form opens blank and overwrites (`:242`); answers lost on failure (`:263-264`); checklist cancel has no UI |
| Grievances and POSH | `/cases` | partial | Assigned handlers without `grievance.manage` have no list (`:20`); only a `?case=` link reaches a case |
| Performance | `/performance` | complete | Finalize shown to a user the server refuses (`:139`); "—" rating blocks submit (`:158`) |
| Assets | `/assets` | complete | Lab-specific defaults (`:8,104`) |
| Policies | `/policies` | complete | Manage-only custom role crashes (`:17,:89`); publish-only role has no path |
| Training / competency | `/competency` | complete | Revoke uses `window.prompt` (`:230`); authorization cancel has no UI |
| Reports | `/reports` | complete | "Run report" with unchanged options does nothing (`:191-192`) |
| Settings: general, attendance, security, installation, organization, jobs | `/settings/*` | complete | Labels "Add legal entitie", "Edit branche" (`:226`) |
| Settings: users | `/settings/users` | complete | Unlock has no try/catch (`:310`) |
| Settings: roles | `/settings/roles` | complete | Enter in filter submits the form (`Roles.tsx:57`) |
| Settings: SMS | `/settings/sms` | complete, **to remove** | §10f |

**Backend routes with no frontend caller** (missing features or spare endpoints): `PUT recruitment/offers/:id`, `POST lifecycle/checklists/:id/cancel`, `GET payroll/fnf-suggestions/:employeeId`, `GET leave/ledger`, `PUT policies/:id`, `GET employees/me`, `GET competency/check`, `POST competency/authorizations/:id/cancel`, `GET field-duty/requests/:id`, `GET overtime/claims/:id`.

---

## 3. Dead code

**Files, routes, runtime dependencies.** None are dead. All routes are reachable and `qrcode` is used only by `src/Mfa.tsx:2`.

| Item | Evidence |
|---|---|
| `applyBrand` `page` param; never passed, so titles never change per page | `auth.tsx:48,74` |
| `--brand-dark`: set, never read, so `BRAND_SECONDARY_COLOR` has no visual effect | `auth.tsx:52`; no `var(--brand-dark)` in `styles.css` |
| `faviconUrl` in config: never applied | `auth.tsx:12` |
| `PublicConfig.modules`: never read | `auth.tsx:17` |
| `RuntimeEnv.productName`, `brandShortName`, `primaryColor`: written, never used | `runtime/env.ts:2,8`, `docker/40-hrms-runtime.sh:41` |
| `.sr-only` class: no references (literal search) | `styles.css:151` |
| `Paged<T>`: exported, unused | `api.ts:49` |
| `void can` | `Payroll.tsx:26` |
| Needless exports (no importer) | `Reports.tsx:16` `fmtCell`; `Performance.tsx:8` `RATING`; `Dashboard.tsx:9,60`; `Leave.tsx:78`; `Documents.tsx:9,29`; `Payslips.tsx:25`; `FieldDuty.tsx:9`; `Assets.tsx:8`; `main.tsx:43,127` |
| `ApplyForm` `employeeId` prop: never passed | `Leave.tsx:78` |
| `eslint-disable` comments, but no ESLint installed | `main.tsx:224`, `ui.tsx:45` |
| `/health`, `/ready` dev proxies: nothing in `src` or `e2e` calls them | `vite.config.ts:13-14` |
| `typecheck` script: not used by CI, duplicated by `lint` and `build` | `package.json:7-8` |
| Vacuous e2e assertion: no such menu item exists | `e2e/navigation.e2e.ts:9` (`Recruitment setup`) |
| Undeclared dev dep: `e2e/tsconfig.json:9` needs `@types/node`, present only transitively | `package.json` |
| `react-router-dom` could be plain `react-router` in v7 (cosmetic) | `package.json:29` |
| Backend-oriented `TEST_*` env applied to the frontend CI job (shared workflow; harmless) | `deployment:.github/workflows/_app-ci.yml` |

After SMS removal, `SMS_TRANSPORT` and `notifications.sms` in `.github/workflows/e2e.yml:75-76` also become dead.

---

## 4. Bugs and security

### 4.1 Crash on failed first load (P0)

`useLoad` leaves `data` null with `loading=false` after a failure (`ui.tsx:39-43`). The common pattern `loading ? <Loading/> : !data.items.length` then throws. No ErrorBoundary exists (`main.tsx:352-356`), so React unmounts the app and the user sees a white page.

Triggers: any 5xx, network drop, or 403 on a direct URL or custom role.

Sites: `Leave:46`, `Notifications:24`, `Documents:158`, `Expenses:46,239`, `Policies:89,210`, `Payslips:15`, `AttendanceAdmin:43,144,174,268`, `Settings:264,331`, `Rosters:213,222`, `Competency:79,101,179,239,299,308`, `Recruitment:86,214`, `Lifecycle:112,143,185,290`, `Payroll:52,244,283`, `Cases:107`.

Reachable with shipped or custom roles:
- A `settings.read` user (the built-in Auditor has it) opening `/settings/users` by URL (`backend:src/modules/tenant/routes.ts:232`).
- A custom role with only `payroll.statutory` gets the Payroll menu item, lands on Runs, gets 403 and crashes (`main.tsx:249`, `Payroll.tsx:52`, `backend:src/modules/payroll/routes.ts:248`).
- A custom role with `policies.manage` but not `policies.read` (`Policies.tsx:17,89`). Custom roles shipped recently, so these combinations are now possible.

### 4.2 Functional bugs

| Sev | Bug | Evidence |
|---|---|---|
| High | Requisition edit form renders before the detail modal; same z-index, so the detail paints on top. Esc closes both | `Recruitment.tsx:97-98,152-154`, `styles.css:125` |
| High | Exit interview closes even when saving failed, because `run` swallows the error and the next line closes the form | `Lifecycle.tsx:263-264` |
| High | Exit interview always opens blank; the backend replaces all answers, so HR can wipe the employee's | `Lifecycle.tsx:242` |
| High | Duplicate records on double click: complaint, claim, expense item, pay adjustment, salary proposal | `Cases.tsx:69-76,91`; `Expenses.tsx:67,140`; `Payroll.tsx:128,204` |
| Med-High | Salary tab shows employee A's UAN, ESI and PAN mask under employee B while loading, and permanently on failure. Edit then pre-fills B's form with A's values | `Payroll.tsx:171-172,185,194-196` |
| Med | `Confirm` closes as if successful because local helpers catch errors first; typed comment lost | `Recruitment.tsx:175,305,372`; `Lifecycle.tsx:81,271`; `Payroll.tsx:141,143`; `Cases.tsx:164`; `Policies.tsx:121` |
| Med | Nested modals: every Modal listens on `window`, so one Esc closes the whole stack. Backdrop mouse-down also discards forms | `ui.tsx:83-89` |
| Med | One-time device key modal closes on Esc or backdrop, and the key is lost | `AttendanceAdmin.tsx:218`, `ui.tsx:84,89` |
| Med | Search-after-select keeps a hidden id: a complaint can name someone not shown; a user can link to a hidden employee | `Cases.tsx:65,72,85-86`; `Settings.tsx:281,302` |
| Med | Enter in a search box submits the parent form | `Roles.tsx:57`; `Employees.tsx:65`; `Settings.tsx:301` |
| Med | Base components input drops commas while typing | `Payroll.tsx:260` |
| Med | Timezone: `toISOString` gives the wrong date 00:00-05:30 IST (`lastMonth` gives the month before last) | `Payroll.tsx:17,184`; `Documents.tsx:10` |
| Med | `*_at.slice(0,10)` shows the UTC date for the same window | `Cases.tsx:52,111`; `Expenses.tsx:205`; `Policies.tsx:43`; `Assets.tsx:51` |
| Med | Page and filter state survive tab change: page 3 then a short scope leaves Empty with no pager; hidden filters stay applied | `Expenses.tsx:26,37`; `Overtime.tsx:25,112`; `FieldDuty.tsx:31,151`; `Loans.tsx:25,130`; `Documents.tsx:77,88`; `Travel.tsx:31,185` |
| Med | Silent truncation with no pager | `Overtime:33`, `FieldDuty:38`, `Loans:32`, `Travel:39` (50); `Documents:149` (100); `MyAttendance:121` (10); Payroll runs (backend limit 100) |
| Med | Actions shown that the server refuses: Withdraw in team scope, Approve to preparer, separation Withdraw, Finalize by own reviewer | `Expenses.tsx:113,215`; `Lifecycle.tsx:240`; `Performance.tsx:139` |
| Med | `.grid-2`/`.grid-4` without `.grid` do nothing: up to 56 selects stack in the pattern form | `Rosters.tsx:108,114,153`; `Roles.tsx:49`; `Delegations.tsx:49`; `AllowanceRates.tsx:57`; `styles.css:61-63` |
| Med | Downloads hidden from read-only users although the register export permits `payroll.read` | `Payroll.tsx:98-109`, `backend:src/modules/payroll/routes.ts:427,456` |
| Low-Med | Failed downloads replace the SPA with raw JSON or save JSON as a file | 11 anchors, e.g. `Payroll.tsx:106-108`, `Reports.tsx:252-253` |
| Low-Med | Non-JSON error bodies (proxy 502) surface as a JSON parse message; `upload` skips the unauthorized event | `api.ts:15,28-29` |
| Low-Med | `crypto.randomUUID()` runs after `setBusy(true)`, outside `try`; on plain HTTP the button sticks | `Dashboard.tsx:22-24` |
| Low | Custom role keys, not names, shown in the sidebar | `main.tsx:285`, `backend:src/modules/auth.ts:113` |
| Low | False "Scheduled; next run —" toast after removing a schedule | `Reports.tsx:85,124` |

Checked and **not** a bug: wrong current password returns 400, not 401, so it does not sign the user out (`backend:src/modules/auth.ts`). CSRF is derived from the session token, so it stays valid after a password change.

### 4.3 Security

**Good, verified.**
- **XSS:** no `dangerouslySetInnerHTML`, `innerHTML` or `eval` in `src`. `helpUrl` must be https and logos must be https or `/branding/*` (`backend:src/config/env.ts:16,86-87,94`). Notification links go through the router (`Notifications.tsx:16`).
- **Tokens:** no `localStorage`, `sessionStorage` or `document.cookie`. Session cookie is httpOnly per `api.ts:1`; CSRF token in memory only (`api.ts:2`).
- **CSRF:** header on every non-GET and on uploads (`api.ts:12,26`).
- **Setup token:** in the URL fragment and stripped on load (`main.tsx:103,107`).
- **MFA QR:** generated in the browser (`Mfa.tsx:55`).
- **Secrets:** none in repo or bundle; no source maps in `dist`. Gitleaks runs in CI. `npm audit --omit=dev`: 0 vulnerabilities.

**Issues.**

| Sev | Issue | Evidence |
|---|---|---|
| Med | Page gating is UI-only and inconsistent. The server is the real boundary, and it holds in every case traced here; the harm is crashes and confusing UX, not data exposure | `main.tsx:316-346` |
| Med | Destructive security actions unconfirmed: rotate key, disable device, reset 2FA | `AttendanceAdmin.tsx:182-183`, `Settings.tsx:311` |
| Med | Bank form state not cleared after saving, so reopening shows the full account number, contrary to the on-screen promise | `Employees.tsx:217,223,236,239` |
| Low | UAN and ESI IP shown in full (PAN and account are masked by the server) | `Payslips.tsx:40`, `Payroll.tsx:196` |
| Low | Punch channel chosen by viewport width; a narrow desktop window claims `mobile`. Backend validation not checked | `Dashboard.tsx:17-18` |
| Low | CSP `style-src 'unsafe-inline'` is required only by the 452 inline styles; a redesign can remove it | `docker/40-hrms-runtime.sh:47` |

---

## 5. Performance

**Measured (`npm run build`).**

| Asset | Raw | Gzip |
|---|---|---|
| `index-O-HeDU2f.js` | 792,218 B | 196.5 KB (Vite) |
| `index-B7JpqinL.css` | 9,868 B | 2.8 KB |
| `index.html` | 0.46 KB | 0.29 KB |

Bundle composition by source map (of 791 KB): app code 508.6 KB (64.3%), react-dom 207.3 KB (26.2%), react-router 38.9 KB (4.9%), qrcode plus dijkstrajs 23.3 KB (2.9%), react 9.5 KB (1.2%). Largest pages: Recruitment 37.6, Payroll 29.9, Competency 28.3, Lifecycle 27.3, Settings 25.8 KB. Vite warns about the 500 KB chunk limit.

- **Code splitting: none.** All pages are imported eagerly (`main.tsx:8-36`), with no `lazy()` or `Suspense`. The login page downloads every screen plus the QR library. Route splitting should remove most of the 64%.
- **Compression:** `docker/nginx.conf` has no `gzip`. Dev gets compression from Caddy (`encode zstd gzip`). Production is an ALB with no CloudFront in terraform (`edge.tf:98`), and ALBs do not compress. Unless the base image enables it (upstream's default config has it commented out; not checked in the image), phones download the full 792 KB. **P0 and a one-line fix.**
- **Caching:** correct. `/assets/` is immutable for a year, `index.html` no-cache, `env.js` no-store (`docker/nginx.conf:16-23`). After code splitting, stale tabs will 404 on removed chunks (`:22`), so a chunk-load retry is needed.
- **Images:** none shipped. The logo has no dimensions other than height (`main.tsx:46`).
- **Fonts:** `Inter` is named but never loaded (`styles.css:19`), so users get system fonts. CSP allows only `font-src 'self'`, so a redesign must self-host.
- **Render-blocking:** `/env.js` in `<head>` is uncached and synchronous on every load (`index.html:7`), and its brand values are unused.
- **Network:**
  - Unread count refetches on every navigation and restarts its timer (`main.tsx:219-225`), with no pause in hidden tabs.
  - No search debounce: `Employees:27,61`, `AttendanceAdmin:100,236`, `Rosters:58,129`, `Settings:253,286`, `Leave:285`, `Assets:65-66`, `Lifecycle:88`, `Cases:65,126`.
  - `Cases.tsx:179` refetches on each keystroke in the membership form.
  - `/org` and employee lists are refetched per component with no cache.

---

## 6. UX

### 6.1 Inconsistent patterns

- **Tabs:** URL-driven in Leave, Expenses, Recruitment, Cases, Performance, Payroll, Lifecycle; local state in Documents, Competency, Travel, Policies and others, so refresh loses the tab. Settings hand-rolls route tabs (`Settings.tsx:31`).
- **Status:** 79 raw `badge` spans against 71 `StatusBadge`; some status text is unformatted (`Lifecycle.tsx:190`, `Documents.tsx:115`).
- **Confirmation:** `Confirm`, a hand-built modal (`Lifecycle.tsx:272-276`), `window.prompt` (`Competency.tsx:230`), or nothing.
- **Pickers:** at least 9 employee pickers (§10a).
- **Empty states:** `Empty` versus `.muted` text (`Dashboard.tsx:90`, `Competency.tsx:51,57`).
- **Money:** ₹ hard-coded in labels while `money()` uses the configured currency (`format.ts:38`).

### 6.2 Confusing flows

- **Menu:** the "Me" group holds 20 items, including Payroll, Recruitment and Approvals (`main.tsx:236-258`). With all modules on, an Employee sees 22 of 28 items (§10d).
- **Settings for non-admins:** `org.read` alone shows Settings, so Department Heads, Laboratory Managers and Hiring Approvers get a menu entry that contains only legal entities and branches (`main.tsx:270`, `Settings.tsx:21`).
- **Direct URLs to disabled modules:** the page still renders because only the nav checks `hasModule`.
- **Returned travel:** Approvals offers "Return for correction", but the traveller cannot correct it (`Approvals.tsx:53,68`, `Travel.tsx:58-61`).
- **F&F payroll:** asks for a raw employee UUID (`Payroll.tsx:69`).
- **Forms discarded:** Esc or a backdrop click drops work without warning (`ui.tsx:84,89`).
- **Page titles:** every tab reads the same (§3).
- **Long pages:** the desktop sidebar is not sticky, so Sign out and the menu scroll away (`styles.css:41`).

### 6.3 Loading, empty, error states per screen

✓ present, ✗ missing or wrong, – not applicable. "Crash" means the error path throws (§4.1).

| Screen | Loading | Empty | Error |
|---|---|---|---|
| Dashboard | ✓ | ✗ `:90` muted | ✗ swallowed `:109-113` |
| Notifications | ✓ | ✓ | Crash `:24` |
| My attendance | ✓ | ✗ punches `:79` | ✗ requests show "No requests" `:128` |
| Team attendance | ✓ | ✓ | ✗ ErrorBox plus Empty `:38-39` |
| Approvals | ✓ | ✓ | ✗ mine `:58`; count "(0)" `:43` |
| Employees list | ✓ | ✓ | ✗ ErrorBox plus Empty `:40-41` |
| Employee history | ✗ | ✗ `:290` | ✗ swallowed `:290` |
| Attendance setup | ✓ | ✗ mappings `:198` | Crash; ✗ unmapped shows "Queue is empty" `:190` |
| Roster grid | ✓ | ✓ | ✓; setup crash `:213` |
| Leave | ✓ | ✓ | Crash `:46`; ✗ `:60,184` |
| Documents | ✗ spins forever on error `:89` | ✓ | ✗ upload has no "no category" message `:49` |
| Expenses mine, categories | ✓ | ✓ | Crash `:46,239` |
| Expenses finance | ✗ `:194` | ✗ shown while loading `:201,210` | ✗ none |
| Policies | ✓ | ✓ | Crash `:89,210` |
| Payslips | ✓ | ✓ | Crash `:15` |
| Overtime, Field duty, Loans, Assets | ✓ | ✓ | ✓ |
| Travel | ✓ | ✓ | ✓; `AdvanceReturned` ignores error `:250,258` |
| Accounting | ✓ | ✗ ledger `:101` | ✓ |
| Payroll | ✓ | ✓ | Crash `:52,244,283`; ✗ salaries `:169-172,185` |
| Recruitment | ✓ | ✗ offers `:349` | Crash `:86,214`; ✗ permanent Loading `:41` |
| Lifecycle | ✓ | ✗ checklist `:69` | Crash `:112,143,185,290` |
| Competency | ✓ | ✓ | Crash, 6 sites; ✗ `:68-70,154` |
| Cases | ✓ | ✗ `:167,189,203` | Crash `:107`; ✗ `:49`; permanent Loading `:181` |
| Performance | ✓ | ✓ | ✓; `team.error` hides the tab `:21,25` |
| Reports | ✓ | ✗ filter no-match `:256` | ✓; ✗ `:54,97` |
| Settings | ✓ | ✗ `:170,355` | Crash `:264,331`; ✗ ErrorBox plus Empty `:129-130` |
| Roles, Delegations, Allowance rates, SMS | ✓ | ✓ | ✓ |

Also: `useLoad` swaps content for Loading on every reload in many screens, which causes flashes and lost scroll (`Performance.tsx:30,68,98`, `Employees.tsx:41`).

### 6.4 Accessibility

**Contrast (computed from `styles.css`).**

| Pair | Ratio | Result |
|---|---|---|
| Light: muted text on white / `surface-2` | 5.82 / 5.24 | Pass |
| Light: brand on white; white on primary button | 6.84 | Pass |
| Light: badge and alert pairs | 5.43-5.95 | Pass |
| Light: input border on white | 1.30 | **Fail** 3:1 for controls (WCAG 1.4.11) |
| Dark: link (brand) on surface | 2.39 | **Fail** |
| Dark: active nav, `badge.info` (brand on info-bg) | 2.13 | **Fail** |
| Dark: error toast, white on danger | 2.28 | **Fail** |
| Dark: input border on surface | 1.38 | **Fail** |
| `--brand-2` default behind white logo initials (gradient end) | 4.25 | Below 4.5 at that end |

Cause: the dark palette does not override `--brand`, and there is no `color-scheme: dark`, so native date pickers and selects stay light (`styles.css:24-29`). Deployment brand colours are never checked against the fixed white button text (`styles.css:89`).

**Keyboard.**
- `tr.clickable` is mouse-only. Only `Employees.tsx:46` handles a key, and only Enter. No other route into the detail at `Expenses:49`, `Policies:41,91`, `Cases:51,110`, `Recruitment:89,167,217,299,503`, `Lifecycle:115,188`, `Payroll:54`, `Competency:104`, `Performance:84`, `TeamAttendance:44`.
- `Tabs` has no arrow keys or tabpanel association (`ui.tsx:122-125`).
- `all: 'unset'` removes the focus ring on report sort buttons (`Reports.tsx:261`).

**Focus and structure.**
- `Modal` does not move, trap or restore focus (`ui.tsx:82-96`). This matters across 95 uses.
- No skip link. No focus move on route change. The sidebar `nav` is unlabelled (the `aside` carries the label). Menu button lacks `aria-expanded` and always says "Open menu" (`main.tsx:292`).
- Error toasts use `role="status"` and vanish after 4.5 s with no way to pause or dismiss (`ui.tsx:14,19`).
- `Field` errors are not tied to inputs with `aria-describedby` (`ui.tsx:68`); the hint also becomes part of the input's name.

**Labels.**
- Placeholder-only or unlabelled: `Lifecycle:91-92` (used by FieldDuty, Assets, Loans), `Competency:157-158`, `Recruitment:191,211`, `Payroll:177-178`, `Cases:152,166,200,202,207-209`, `Lifecycle:245,308-310`, `Policies:206`, `Performance:158`, `MyAttendance:109-110`.
- `Settings.tsx:52-54,60` ValueEditor inputs: the visible label is a div (`:89`) with no association. This covers all settings fields.
- Icon-only × without a name: `Lifecycle:311`, `Payroll:121`, `Cases:201,210`.
- Nested labels: `Competency:340-343`.
- `role="grid"` with no rows or cells (`MyAttendance:44`); selected day has no `aria-selected` (`:50`).
- `aria-label` on role-less divs has no effect: `Travel:87`, `PersonalDetails:117`, `Rosters:158`, `Notifications:29`.
- Roster cell labels omit the shift value (`Rosters:80`).

**Colour-only meaning.** `Leave:148`, `Documents:18`, `Policies:44`, `Cases:112`, `Competency:84`, `Lifecycle:48`, `Employees:200`.

**Touch targets (computed).** `.btn.sm` about 26px, `.btn` about 35px, nav links about 33px, all under the 44px guideline. WCAG 2.2 AA's 24px minimum is met in general; the exceptions are roster cell buttons with `padding: 0` (`Rosters.tsx:80`).

### 6.5 Mobile

Only two responsive rules exist for screens (`styles.css:51,136`).

- **Drawer trap (P0).** The fixed sidebar covers 70% of the width with no backdrop, and it covers the menu button (`styles.css:53`, `main.tsx:292`). It closes only when the pathname changes (`main.tsx:233`), so tapping the current page or outside does nothing.
- **iOS zoom.** 14px inputs trigger zoom on focus (`styles.css:20,97`). Font size in `px` on `:root` also ignores the browser's text-size setting.
- **Toasts** can cover bottom actions; **modals** have about 299px inner width at 375px, so `grid-2` (minmax 300px) overflows (`PersonalDetails.tsx:160`, `Settings.tsx:305`).
- **Calendar** cells are about 40px wide with text like "Not calculated" (`MyAttendance.tsx:44,52`, `styles.css:140`).
- `td.row` applies `display:flex` to table cells, breaking layout (`SmsSettings.tsx:25`, `Travel.tsx:56,205`, `FieldDuty.tsx:55`, `Loans.tsx:62`).
- `flexWrap:'nowrap'` action cells force width (`Approvals.tsx:51`, `Documents.tsx:20`, `Expenses.tsx:214`, `Policies.tsx:134`, `Assets.tsx:84`, `Lifecycle.tsx:72`, `Payroll.tsx:115,288`).
- Playwright has no mobile viewport (`playwright.config.ts:25`).

### 6.6 Tables on phones

All but one sit in `.table-wrap`, which only scrolls sideways (`styles.css:102`), so at 375px actions are off-screen. There is no card layout.

| Verdict | Tables |
|---|---|
| **Unusable** (grid) | `Leave:157` (29 cols), `Rosters:75` (15, sticky first col), `Competency:80` (1+N) |
| **Poor** (8+ cols, or action cells off-screen) | `TeamAttendance:41` (9), `Overtime:127` (9), `AttendanceAdmin:44` (9), `AttendanceAdmin:175`, `Payroll:53,111` (8), `Competency:181`, `Leave:185`, `Assets:78`, `FieldDuty:168`, `Expenses:240` (8), `Approvals:45` |
| **Poor** (7 cols) | `Competency:241,300,309`, `Recruitment:88,216`, `Lifecycle:187`, `Payroll:245,284`, `Travel:52,199`, `Assets:48`, `Loans:55`, `Performance:83`, `Reports:258` (dynamic), `Settings:208` |
| **Scroll tolerable** (5-6) | Most others: `Employees:43`, `Leave:62`, `Expenses:48,202,211`, `Documents:13,112`, `Overtime:47,56`, `FieldDuty:49`, `Policies:40,90,130`, `Payslips:16`, `Lifecycle:45,114,144,291`, `Recruitment:166,502`, `MyAttendance:129`, `Settings:176,266,333,372`, `Accounting:36,45` |
| **Fine** (≤4) | `Employees:199,291`, `Payroll:154,186`, `Travel:158,171`, `Loans:115,118`, `Accounting:66,101`, `Policies:212`, `Recruitment:298`, `SmsSettings:21`, `Settings:169` |

Priority for phone cards: employee self-service first (leave, attendance, approvals, expenses, payslips, policies), then the roster and leave calendar as dedicated views. Admin tables can stay as scrolling tables.

---

## 7. DevOps

**Good.** Non-root image, read-only root, `no-new-privileges`, `cap_drop ALL` in compose. Actions pinned by SHA. Signed images with SBOM and provenance. Hadolint, Trivy, gitleaks, `npm audit` in CI. Dependabot covers npm, Docker and Actions. Env values escaped and validated in the runtime script (`docker/40-hrms-runtime.sh:20-29`). nginx correctly repeats security headers per location, because `add_header` does not inherit once a location sets its own.

**CSP** (`docker/40-hrms-runtime.sh:47`): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: <logo/favicon origins>; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`. This is strong. Constraints for the redesign: no CDN fonts or scripts, and no `blob:` image previews.

| Sev | Issue | Evidence |
|---|---|---|
| P0 | No compression in nginx, and none in front of it in production | `docker/nginx.conf`; `edge.tf:98` |
| P1 | E2E runs against `vite preview`, not the nginx image, so CSP, headers, the runtime script and SPA fallback are never exercised. A CSP-breaking change would pass CI | `.github/workflows/e2e.yml:83-84` |
| P1 | Develop publish and release run no e2e; e2e is PR-only, and only for PRs into `develop`/`main` | `publish-develop.yml:14-20`, `e2e.yml:6-7` |
| P1 | E2E tests against floating `hrms-backend:develop`, so backend changes can break unrelated frontend PRs, and API-contract drift shows up late | `e2e.yml:38` |
| P2 | Base images use tags, not digests; `apk upgrade` is unpinned, so builds are not reproducible | `Dockerfile:5,12,23` |
| P2 | Trivy gates on CRITICAL only; HIGH is reported but passes | `_app-ci.yml` |
| P2 | Only 3 unit tests, none on `api.ts`, `format.ts` or `useLoad`, where the bugs are | `src/runtime/env.test.ts` |
| P2 | "Lint" is `tsc` only; no ESLint, no `eslint-plugin-jsx-a11y`, no axe | `package.json:7` |
| P2 | `retries: 1` in CI can hide flakes | `playwright.config.ts:16` |
| P2 | Missing favicon returns `index.html` with 200 when `BRAND_FAVICON_URL` is unset; no `robots.txt`, so an internal HR app can be indexed | `docker/nginx.conf:31` |
| P2 | Default colour differs: container `#1f4e79`, backend and CSS `#1f5f8b` | `40-hrms-runtime.sh:13`, `backend:src/config/env.ts:88`, `styles.css:2` |
| P2 | Dev compose omits `BRAND_SECONDARY_COLOR` and `BRAND_ACCENT_COLOR` from its shared branding block (terraform passes them) | `deployment:environments/dev/docker-compose.yml:33-39`, `compute.tf:125-126` |

---

## 8. Prioritised plan

Effort: S under a day, M a few days, L a week or more.

### P0: before or at the start of the redesign

| Task | Effort | Fixes |
|---|---|---|
| Add a root and per-route ErrorBoundary; make `useLoad` consumers safe via a shared `<Async>` wrapper | M | §4.1 |
| Enable gzip in nginx (static brotli optional) | S | §5 |
| Route splitting with `lazy()`, chunk-load retry, move shared components out of pages first | M | §5 |
| Fix the mobile drawer: backdrop, Esc, close button, `aria-expanded` | S | §6.5 |
| Route registry: one table of path, permission, module, label, group, driving both nav and guards, with a proper 403 and module-off page | M | §4.1, §10b |
| Confirm finalize payroll, cancel run, rotate key, reset 2FA, batch approve | S | §4.2, §4.3 |
| Fix the exit interview overwrite and lost answers; fix requisition edit | S | §4.2 |

### P1: within the redesign

| Task | Effort | Fixes |
|---|---|---|
| Design system: Table with responsive cards, row-link pattern, EmployeePicker, StatTile, PageHeader, FilterBar, Badge, FormSheet, DownloadLink | L | §6, §10a |
| Modal: focus management, stack-aware Esc, dirty guard | S | §4.2, §6.4 |
| Form busy state and idempotency on all creates; `Confirm` must see errors | M | §4.2 |
| Typed API client, generated from backend schemas | L | §10b, §10c |
| Replace inline styles and drop `style-src 'unsafe-inline'` | L | §4.3 |
| Dark palette with brand-aware tokens; computed on-brand text colour | M | §6.4 |
| Self-service phone views; 16px inputs; 44px targets | L | §6.5 |
| Labels on all pickers, ValueEditor and rows; add axe to e2e and jsx-a11y to lint | M | §6.4 |
| Task-based navigation | M | §10d |
| Remove SMS across all three repos | M | §10f |
| Gate or neutralise lab wording | S | §10g |
| Fix timezone helpers, pagination, tab reset | M | §4.2 |
| Run e2e against the built image; add a mobile project | M | §7 |

### P2: afterwards

Missing flows (edit offer, resubmit returned trip, F&F picker, unlock attendance), search debounce and request cache, per-page titles, currency-aware labels, digest pinning, `robots.txt`, unit tests for `api`, `format`, `useLoad`.

---

## 9. Not verified

- Nothing was run in a browser. Modal stacking, overflow, drawer behaviour and iOS zoom are traced from code.
- Playwright suite not run, so its current pass state is unknown.
- nginx's effective gzip setting in the base image; the conclusion rests on upstream's default config.
- Backend permissions for `overtime/claims?scope=all`, `field-duty/requests`, `loans/requests` and `accounting/ledger-map` against tab gates.
- Whether double submits actually create duplicates depends on backend uniqueness not checked for each route.
- Behaviour on disabled modules relies on `requireFeature` throwing; the handler was not read in full.
- Phone table verdicts are judged from column counts, not rendered.

---

## 10. Revamp impact map

### a) `ui.tsx` inventory and ad-hoc duplicates

| Component (line) | Uses in pages | Gaps |
|---|---|---|
| `ToastProvider`, `useToast` (`:9`) | widespread | No dismiss; errors are polite |
| `errText` (`:26`) | widespread | |
| `useLoad` (`:35`) | 161 | Null `data` on error, stale data on deps change, no abort, no cache |
| `Loading` (`:51`) | 111 | Sets `aria-busy` (e2e dependency) |
| `Empty` (`:52`) | 81 | |
| `ErrorBox` (`:53`) | 152 | `role="alert"`, `.alert.error` (e2e dependency) |
| `statusLabel`, `StatusBadge` (`:56,61`) | 71 | Status colours in an inline map |
| `Field` (`:67`) | 357 | Wrapping label; hint in accessible name |
| `Pager` (`:71`) | 21 | Prev/next only |
| `Modal` (`:82`) | 95 | Focus, nested Esc, dirty guard |
| `Confirm` (`:99`) | 37 | Comment box only when `requireComment` is defined |
| `Tabs` (`:122`) | 19 | No arrow keys, tabpanel, or URL sync |

**Not in `ui.tsx`, but needed:**

| Missing | Ad-hoc copies |
|---|---|
| **Table / row link** | 94 tables, 93 `.table-wrap`, 18 `tr.clickable`; local `Table` at `Delegations.tsx:61` |
| **Employee picker** | Shared one lives in `Lifecycle.tsx:86` (imported by FieldDuty, Loans, Assets). Copies: `Recruitment:56` (same name, different props), `Competency:152`, `Employees:59`, `Leave:294`, `Payroll:177`, `AttendanceAdmin:96,234`, `Rosters:127`, `Settings:285`, `Delegations:13`, `Cases:84,166,202` |
| **Stat tile** | `TileCard` in `Dashboard.tsx:60` is unshared. 28 `.stat` uses, e.g. `Leave:49`, `Expenses:195`, `Loans:109`, `Payroll:95`, `MyAttendance:65`, `Employees:227,270`, `Settings:142`, `Travel:163`, `Cases:193` |
| **Filter bar** | `TeamAttendance:24`, `Employees:34`, `Overtime:119`, `FieldDuty:159`, `Assets:70`, `Loans:140`, `Travel:191`, `Cases:103`, `Performance:77`, `Settings:124,262,328` |
| **Badge** | 79 raw spans, e.g. `Competency:41,84`, `Lifecycle:48`, `Payroll:56`, `Policies:43`, `Assets:19` |
| **Alert** | 31 raw `.alert`, some errors lacking `role="alert"` (`Leave:119,124`, `Accounting:64,65`, `Policies:38`) |
| **Download link** | 11 anchors with repeated `textDecoration:'none'`; `Employees:187` and `Mfa:39` use `data:` |
| **Route tabs** | `Settings.tsx:31` |
| **Date/period navigator** | `MyAttendance:36`, `Rosters:66`, `AttendanceAdmin:142` |
| **Link-style button** | `Approvals:47,61`, `Roles:109,127` |
| **Confirm variants** | `Lifecycle:272`, `Competency:138,230` |
| **Date helpers** | `Documents:27` duplicates `format.addDays`; `Payroll:17,184` skip `todayLocal` |

**Shared components living in pages (move before splitting, or chunks will pull whole pages):** `EmployeePicker` (Lifecycle), `PayLines` (Payroll, used by Payslips, so employees would load Payroll code), `AttendanceCalendar` (MyAttendance), `PersonalDetails`, `ProfileChangeView`, `EmployeeDocuments` (Documents), `RosterSetup` (Rosters), `Delegations`, `AllowanceRates`/`VEHICLE`, `Roles`, `SmsSettings`. Also `BrandMark` and `ChangePasswordForm` in `main.tsx`, which should leave the entry file.

### b) API, auth, capabilities, menu, routes

**API (`src/api.ts`).** `api.get/post/put/patch/del` go through `request` (`:9`). `api.upload` posts multipart (`:25`). All return `any` by default, and URLs are literal strings at call sites.
- CSRF: `x-csrf-token` on non-GET when set (`:12`). Credentials `same-origin`.
- Errors: `{ error: { code, message, details } }` becomes `ApiError(status, code, message, details)`. `errText` flattens `details` (`ui.tsx:26-32`). Callers depend on specific details, e.g. duplicate candidates (`Recruitment.tsx:245`).
- 401 fires `hrms:unauthorized` except on login (`api.ts:18`), and `AuthProvider` clears `me` (`auth.tsx:84-88`). `upload` skips this (`:29`).
- Downloads are not API calls: plain `<a href>` using the cookie.
- **Typed client notes:** responses are mostly snake_case (`start_date`), requests camelCase; optimistic locking via `version` (409); paging `{items,page,pageSize,total}` (`Paged` unused, but the shape is real).

**Boot and auth (`src/auth.tsx`).**
1. `GET /public/config`, then `applyBrand` and `setLocalePrefs` (`:72-75`). A 404 is terminal "not configured"; anything else retries with reload after 5 s (`:77-81`).
2. `GET /auth/me` sets CSRF, locale prefs and `me` (`:62-69`). During MFA, `/auth/me` returns empty permissions and `preferences: null` (`backend:src/modules/auth.ts:97-100`).
3. `App` gate order (`main.tsx:303-313`): config error → Loading → `/setup` → Login → MFA verify → MFA enrol → forced password → Shell.

Deep links survive login because nothing redirects. The URL also persists across a user change, so the next user can land on a page they lack (crash path).

**Permissions and modules.** `useAuth()` gives `can(...)` (all), `canAny(...)`, `hasModule(key)`, `me`.
- `me.permissions` are strings like `leave.team.read`.
- `me.capabilities` is the only module source: `{ [feature.key]: usable }` (`backend:src/modules/auth.ts:119`), from `backend:src/core/features/registry.ts`.
- `hasModule` is read in nav and a few pages; 11 audited pages never call it. Backend also returns per-response flags used by the UI: `data.canManage`, `canEdit`, `grantable`, `advanced`. Keep these.

**Menu.** Inline literal in `Shell` (`main.tsx:235-272`) with `{to,label,show}` per item and three groups. It is separate from routes and each page's own gates, so all three drift apart. The Training/Competency label switches on a module (`:255`).

**Routes.** Flat `<Routes>` in `App` (`main.tsx:315-347`), all eager, with no guards; `*` redirects to `/`. `/setup` is handled above `<Routes>` (`:307`). Settings has nested routes (`Settings.tsx:32-44`) with absolute tab links by design (`:43` comment). Query-string sub-state is part of the app's URL contract: `?tab=`, `?case=`, `?application=`, `?claim=`, `?version=`, `?r=`, `?snapshot=`.

### c) Endpoints by page

Prefix `/api/v1`. `:id` = path param. **DL** = browser download via anchor. `(u)` = multipart upload. `{a,b}` = one path per value. Scripted check against backend route files found no frontend call without a route; 27 script misses were sub-route files, confirmed by hand for `expenses/allowances.ts`, `attendance/roster-routes.ts`, `employees/profile.ts` and `core/workflow`.

| Page | Endpoints |
|---|---|
| **auth.tsx** | GET `public/config`; GET `auth/me`; POST `auth/logout` |
| **main.tsx** (Login, Setup, Account, Shell) | POST `auth/login`, `auth/setup`, `auth/password`, `auth/sessions/revoke-all`, `auth/mfa/recovery-codes`, `auth/mfa/disable`; PUT `auth/preferences`; GET `notifications/unread-count` |
| **Mfa** | POST `auth/mfa/verify`, `auth/mfa/setup`, `auth/mfa/enable` |
| **Dashboard** | GET `dashboard`, `attendance/me/today`, `approvals/inbox`, `approvals/mine`, `policies/mine`; POST `attendance/punch` |
| **MyAttendance** | GET `attendance/me?from&to`, `attendance/employees/:id?from&to`, `attendance/regularizations?scope=mine&pageSize=10`; POST `attendance/regularizations` |
| **TeamAttendance** | GET `org`, `attendance/daily?date&branchId&status&exceptionsOnly&page&pageSize=50`; POST `attendance/recalculate` |
| **Approvals** | GET `approvals/inbox`, `approvals/mine`, `approvals/:id`; POST `approvals/:id/act`, `approvals/:id/cancel` |
| **Delegations** | GET `approvals/delegates?q`, `approvals/delegations`, `approvals/delegations?scope=all`; POST `approvals/delegations`, `approvals/delegations/:id/revoke` |
| **Employees** | GET `org`, `employees?search&branchId&departmentId&status&page&pageSize=25`, `employees?search&status=active&pageSize=20`, `employees/:id`, `employees/:id/bank-account`, `employees/:id/history`; POST `employees`, `employees/import`; PATCH `employees/:id`; PUT `employees/:id/bank-account`. CSV template is a `data:` link (`:187`) |
| **PersonalDetails** | GET `employees/:id/profile`, `employees/profile-changes/:id`; PUT `employees/:id/profile/:section`; POST `employees/profile-changes/:id/withdraw` |
| **AttendanceAdmin** | GET, POST `attendance/shifts`; PUT `attendance/shifts/:id`; POST `attendance/shift-assignments`; GET `employees?search&status=active&pageSize=50`, `…pageSize=20`, `org`, `tenant/installation`; GET, POST `attendance/holidays` (GET `?year`); DELETE `attendance/holidays/:id`; GET, POST `attendance/devices`; PATCH `attendance/devices/:id`; POST `attendance/devices/:id/rotate-key`; GET `attendance/device-events/unmapped`, `attendance/device-mappings`; PUT `attendance/device-mappings/:deviceUserId`; GET, POST `attendance/locks` |
| **Rosters** | GET `attendance/roster?from&to&search`, `attendance/shifts`, `employees?search&status=active&pageSize=50`; PUT `attendance/roster-overrides`; DELETE `attendance/roster-overrides/:employeeId/:date`; GET, POST `attendance/roster-patterns`; PATCH `attendance/roster-patterns/:id`; POST `attendance/roster-assignments`, `attendance/roster-assignments/end` |
| **Leave** | GET `leave/balances`, `leave/requests?scope=mine&page&pageSize=10`, `leave/calendar?from&to`, `leave/types?includeInactive=true`, `employees?search&pageSize=20`; POST `leave/requests`, `leave/requests/preview`, `leave/requests/:id/cancel`, `leave/types`, `leave/accruals`, `leave/year-end`, `leave/adjustments`; PUT `leave/types/:id` |
| **Notifications** | GET `notifications?unread&page&pageSize=20`; POST `notifications/:id/read`, `notifications/read-all` |
| **Documents** | GET `documents/categories`, `documents?scope&expiringWithinDays=30&page&pageSize=25`, `documents?employeeId&pageSize=100`; POST `documents` (u), `documents/:id/archive`, `documents/categories`; PUT `documents/categories/:id`; **DL** `documents/:id/download` |
| **Expenses** | GET `expenses/claims?scope&page&pageSize=20`, `expenses/claims/:id`, `expenses/categories`, `expenses/allowance-rates`, `expenses/allowance-quote?kind&date&tier&vehicle`, `expenses/payables`, `expenses/batches`, `expenses/reports/ageing`; POST `expenses/claims`, `expenses/claims/:id/{submit,cancel}`, `expenses/claims/:id/items` (u), `expenses/batches`, `expenses/batches/:id/{approve,cancel,paid}`, `expenses/categories`; PUT `expenses/claims/:id`, `expenses/categories/:id`; DELETE `expenses/claims/:id/items/:itemId`; **DL** `expenses/items/:id/receipt`, `expenses/batches/:id/export.csv` |
| **AllowanceRates** | GET, POST `expenses/allowance-rates`; DELETE `expenses/allowance-rates/:id` |
| **Policies** | GET `policies/mine`, `policies/versions/:id`, `policies`, `policies/:id`, `org`, `policies/versions/:id/acknowledgements?status&page&pageSize=25`; POST `policies`, `policies/:id/retire`, `policies/:id/versions` (u), `policies/versions/:id/{acknowledge,publish,discard,withdraw}`; **DL** `policies/versions/:id/file?inline=true` (new tab), `policies/versions/:id/acknowledgements.{csv,xlsx}` |
| **Payslips** | GET `payroll/payslips/mine`, `payroll/payslips/:id` |
| **Overtime** | GET `overtime/eligible`, `overtime/claims?scope&status&period&page&pageSize`; POST `overtime/claims`, `overtime/claims/:id/{withdraw,cancel}` |
| **FieldDuty** | GET `field-duty/requests?scope&on&status&page&pageSize`, `employees?search&pageSize=20`; POST `field-duty/requests`, `field-duty/requests/:id/{withdraw,cancel,report}` |
| **Assets** | GET `assets/mine`, `assets?search&status&category&calibrationWithinDays&page&pageSize=25`, `assets/:id/history`, `org`, `employees?search&pageSize=20`; POST `assets`, `assets/assignments/:id/acknowledge`, `assets/:id/{issue,receive}`; PUT `assets/:id` |
| **Loans** | GET `loans/requests?scope&status&kind&page&pageSize`, `loans/requests/:id`, `employees?search&pageSize=20`; POST `loans/requests`, `loans/requests/:id/{withdraw,disburse,repayment,defer,cancel}` |
| **Accounting** (`:kind` = `payroll-runs`, `reimbursement-batches`) | GET `accounting/sources`, `accounting/:kind/:id/journal`, `accounting/ledger-map`; PUT `accounting/ledger-map`; **DL** `accounting/:kind/:id/export?format={csv,tally_xml}` |
| **Competency** | GET `competency/{me,methods,courses}`, `competency/matrix?discipline`, `competency/authorizations?status&page&pageSize=25`, `competency/authorizations/:id`, `competency/assessments?page&pageSize=25`, `competency/training-records?page&pageSize=25&expiringWithinDays=30`, `employees?search&pageSize=20`; POST `competency/authorizations`, `competency/authorizations/:id/{suspend,reinstate,withdraw}`, `competency/assessments`, `competency/courses`, `competency/methods`, `competency/training-records`, `competency/training-records/:id/revoke`; PUT `competency/courses/:id`, `competency/methods/:id` |
| **Recruitment** (`r/` = `recruitment/`) | GET `org`, `employees?search&pageSize=20`, `r/requisitions?status&page&pageSize=25`, `r/requisitions/:id`, `r/candidates?search&page&pageSize`, `r/candidates/:id`, `r/applications/:id`, `r/panel-users?search`, `r/interviews/mine`; POST `r/requisitions`, `r/requisitions/:id/{submit,hold,reopen,close,cancel}`, `r/candidates` (u), `r/candidates/:id/anonymize`, `r/applications`, `r/applications/:id/{move,interviews,offers}`, `r/interviews/:id/{cancel,feedback}`, `r/offers/:id/{submit,sent,accepted,declined,withdraw,hire}`; PUT `r/requisitions/:id`; **DL** `r/candidates/:id/resume` |
| **Lifecycle** (`l/` = `lifecycle/`) | GET `l/tasks/mine`, `l/checklists?kind=onboarding&status&page&pageSize=25`, `l/checklists/:id`, `l/probation?status`, `l/separations?scope&page&pageSize=25`, `l/separations/:id`, `l/templates`, `employees?search&pageSize=20`; POST `l/tasks/:id/{done,skip,reopen}`, `l/checklists`, `l/employees/:id/joined`, `l/probation/:id/submit`, `l/separations`, `l/separations/resign`, `l/separations/:id/{withdraw,cancel,complete,fnf,exit-interview}`, `l/templates`; PUT `l/separations/:id/lwd`, `l/templates/:id` |
| **Payroll** (`p/` = `payroll/`) | GET `org`, `employees?search&pageSize=20`, `p/runs`, `p/runs/:id`, `p/employees/:id/{salaries,statutory}`, `p/components`, `p/statutory-rules`; POST `p/runs`, `p/runs/:id/{compute,submit,finalize,cancel,paid,hold,acknowledge-warnings}`, `p/runs/:id/adjustments`, `p/employees/:id/salaries`, `p/components`, `p/statutory-rules`, `p/statutory-rules/:id/{verify,retire}`; PUT `p/employees/:id/statutory`, `p/components/:id`, `p/statutory-rules/:id`; DELETE `p/runs/:id/adjustments/:adjId`; **DL** `p/runs/:id/register.{xlsx,csv}`, `p/runs/:id/{bank,pf,esi}.csv` |
| **Cases** | GET `cases/committee`, `cases?kind&scope&status`, `cases/:id`, `cases/people?search`, `cases/posh/annual-report?year`, `employees?search&pageSize=10`; POST `cases`, `cases/:id/{events,withdraw,assign}`; PUT `cases/committee` |
| **Performance** | GET `performance/cycles`, `performance/cycles/:id/goals/:employeeId`, `performance/reviews?cycleId&scope`, `performance/reviews/:id`; POST `performance/cycles`, `performance/cycles/:id/{activate,close}`, `performance/cycles/:id/goals/:employeeId`, `performance/goals/:id/{agree,drop,progress}`, `performance/reviews/:id/{self,manager,finalize,acknowledge}` |
| **Travel** | GET `travel/requests?scope&status&advance&on&page&pageSize`, `travel/requests/:id`, `expenses/allowance-rates`, `expenses/allowance-quote?kind=per_diem&tier&date&to`; POST `travel/requests`, `travel/requests/:id/{claim,withdraw,cancel,complete,close,advance-paid,advance-returned}` |
| **Reports** | GET `reports`, `reports/:key?<params>`, `reports/snapshots`, `reports/snapshots/:id`, `reports/saved`, `reports/saved/:id/recipients`; POST `reports/saved`; PUT `reports/saved/:id/schedule`; DELETE `reports/saved/:id`, `reports/saved/:id/schedule`; **DL** `reports/:key/export.{csv,xlsx}?<params>`, `reports/snapshots/:id/export.{csv,xlsx}` |
| **Settings** | GET `tenant/settings?branchId`, `tenant/installation`, `org`, `tenant/roles`, `tenant/users?search&page`, `employees?search&pageSize=20`, `tenant/audit?category&page&pageSize=50`, `tenant/jobs`; PUT `tenant/settings/:key`; DELETE `tenant/settings/:key?scope&branchId`; POST `org/{legal-entities,branches,departments}`, `tenant/users`, `tenant/jobs/:key/run`; PUT `org/:kind/:id`; PATCH `tenant/users/:id` (`{roles,status}`, `{unlock}`, `{resetMfa}`) |
| **Roles** | GET, POST `tenant/roles`; PATCH, DELETE `tenant/roles/:key` |
| **SmsSettings** (remove) | GET `sms/templates`, `sms/outbox?status`; PUT, DELETE `sms/templates/:kind`; POST `sms/test` |

`GET employees?search` is called directly from 10 page files, and `GET org` from 8, so shared hooks should replace them first.

### d) Navigation by role today

Items and rules are at `main.tsx:236-271`. The matrix below was computed from `SYSTEM_ROLES` (`backend:src/core/auth/permissions.ts:115-143`) with **all modules on and an employee record linked**. Module-off installs show less. Default-on modules are `core.employees`, `core.org_structure`, `core.self_service`, `core.documents`, `attendance`, `attendance.web`, `attendance.regularization`, `shifts`, `holidays` and `leave`; the rest are opt-in (`backend:src/core/features/registry.ts`).

**Base menu, shown to everyone (22 items):** Dashboard, Notifications, My profile, My attendance, Leave, Overtime, Field duty, Travel, Advances & loans, Recruitment, Payslips, Grievances & POSH, Performance, Assets, Onboarding & exit, Policies, Competency/Training, Expenses, Approvals, Employees, Documents, Roster.

| Role | Items | Added to base |
|---|---|---|
| Employee | 22 | none |
| Hiring Approver | 23 | Settings |
| Reporting Manager | 24 | Team attendance, Reports |
| Administrator | 24 | Attendance setup, Settings |
| IT Administrator | 24 | Attendance setup, Settings |
| Quality Manager | 24 | Reports, Settings |
| Department Head | 25 | Team attendance, Reports, Settings |
| Laboratory Manager | 25 | Team attendance, Reports, Settings |
| HR Executive | 26 | Team attendance, Reports, Attendance setup, Settings |
| Finance Manager | 26 | Payroll, Reports, Accounting, Settings |
| Auditor | 26 | Payroll, Team attendance, Reports, Settings |
| HR Administrator | 27 | Payroll, Team attendance, Reports, Attendance setup, Settings |
| Payroll Manager | 28 | Payroll, Team attendance, Reports, Attendance setup, Accounting, Settings |

Implications:
- **Role barely shapes the menu.** Self-service items dominate because `SELF` permissions are on nearly every role. The real difference is *inside* pages through tabs. A role-based redesign needs task grouping, not just permission filtering.
- **Always-visible items without permission checks:** Recruitment (panel members), Approvals, Notifications, Documents, Grievances, Onboarding & exit.
- **The personas in e2e** map as: `analyst`, `sampler` = Employee; `lab.manager` includes Laboratory Manager, Reporting Manager; `director` includes Department Head, Reporting Manager, Hiring Approver; `hr.head` = HR Admin; `hr.exec`; `payroll`; `finance`; `quality`; `it`.
- **Custom roles** (from #30) make any permission combination possible, so navigation must be driven by permissions, never role keys.
- **The Administrator role holds no payroll or employee-management permissions** (`permissions.ts:116-118`), so an admin-centric IA would not match it.

### e) What e2e depends on

21 specs. Selector counts: `getByRole` 381 (dialog 72, row 60, table 23, tab 21, region 8, status 2), `getByLabel` 127, `getByText` 71, `locator` 46, `getByPlaceholder` 3; `selectOption` 27, `fill` 92. Only Desktop Chrome. **The suite is role and text based, so it survives a visual reskin well if roles and names stay. It breaks where structure changes.**

**Silent false passes: fix first.** These would keep passing while proving nothing:
- `noErrors` looks for `[role="alert"].alert.error` with count 0 (`e2e/helpers.ts:38`). Rename the class and every spec's error check passes vacuously.
- `[aria-busy="true"]` count 0 in `e2e/navigation.e2e.ts:27`. Change the loader and the wait disappears.
- Hidden menu assertions use `toHaveCount(0)` (`:20`). A renamed item also passes.

Recommend switching these to `data-testid` or an explicit contract before restyling.

**Hard contract to keep or update together:**

| Dependency | Evidence | Redesign impact |
|---|---|---|
| `aria-label="Main navigation"` containing the links | `helpers.ts:9,32`, `navigation.e2e.ts:18` | Keep label on the container. Two navs (rail + drawer) break strict mode |
| Link accessible name equals label, exact | `helpers.ts:32`, `navigation.e2e.ts:19` | Icons need `aria-hidden`; badges change names. Renamed items need test edits. Collapsed groups fail `toBeVisible` |
| Every nav link navigates and the page shows an `h1` | `navigation.e2e.ts:22-28` | Each page needs one `h1`. `open()` matches name to link label (`helpers.ts:33`) |
| Login: `Work email`, `Password`, `Sign in` | `helpers.ts:23-25` | `getByLabel('Password')` is a substring match: a "Show password" toggle will break it |
| Modal: `role="dialog"` with name = title | 72 uses; e.g. `leave.e2e.ts:32` | Forms moved to pages or sheets must keep `role="dialog"` and titles. `page.getByRole('dialog').last()` relies on DOM order (`recruitment.e2e.ts:10`) |
| Tabs: `role="tab"` names | `Rosters`, `Ledger map`, `Journals`, `My requests`, `While I'm away`, `/Awaiting me/`, `Everyone`, `My team`, `All reviews`, `Asset register` | Tab labels are test contract. `/Awaiting me/` allows the count suffix |
| Table rows: `role="row"` filtered by text; buttons inside | 60 uses | Desktop tables must stay real tables. Card views only below a breakpoint, as tests run on Desktop Chrome |
| Table names (`aria-label`) | Headcount, Leave taken, Leave balances, Department overview, Attendance summary, Ledger map, Roster, My trips, Trips, Overtime to claim, My overtime claims, Overtime claims, Field duty, My field duty, Advances and loans, My advances and loans, My saved reports, Schedule | Keep names |
| Section `aria-label`s | Built-in roles, Organization roles, Roster patterns, Per diem (per day), Mileage (per km), Per diem, My handover, All handovers, Emergency contacts, Nominees | CSS selector `[aria-label="…"]`, so any element works |
| Dashboard regions | `Organization`, `Attendance today`, `Your team`, `On leave today`, `You` | `dashboard.e2e.ts:9-11,36-41,48-50` |
| `data-tile="<key>"` with `.v` child | `headcount`, `team_size`, `training_expiry`, `leave_CL`, `expenses_to_pay` (`dashboard.e2e.ts:4`; `Dashboard.tsx:69`) | Keep attribute; `.v` class is a CSS dependency |
| CSS classes | `.card.stat` + `.v` (`leave.e2e.ts:23`), `.stat` (`field-duty.e2e.ts:66`, `loans.e2e.ts:47`, `travel.e2e.ts:69`), `.badge` (`performance.e2e.ts:6`) | Most fragile: replace with test ids |
| Table structure | `td:nth-child(5)` (`overtime.e2e.ts:21`), `tbody tr td:nth-child(3)` (`reports.e2e.ts:69`), `tfoot td` `.nth(1)` (`dashboard.e2e.ts:19`, `reports.e2e.ts:34`) | Column order is contract |
| Native controls | `selectOption` 27, `locator('option')` 5, `fill` on date inputs | **Custom select or date picker components break these.** Keep native or update tests |
| Toasts visible with exact text | e.g. `Leave requested: 1 day(s). Sent for approval.`, `Request approved`, `Role saved`, `Rate added` | Copy changes fail tests. Longer-lived toasts may cause duplicates |
| `role="status"` notices | `approval-delegation.e2e.ts:40,77` | Toast wrap also has `role="status"` (`ui.tsx:19`) |
| Placeholders | `Search people` (`recruitment.e2e.ts:74`), `Search name or code` (`assets.e2e.ts:21,39`) | Fixing the a11y gap by adding labels is fine if placeholders stay |
| URLs | `/account`, `/accounting`, `/approvals`, `/attendance/admin`, `/attendance/me`, `/expenses?tab=finance`, `/expenses?tab=rates`, `/field-duty`, `/leave`, `/loans`, `/overtime`, `/profile`, `/recruitment?tab=interviews`, `/recruitment?tab=requisitions`, `/reports?r=…&groupBy=…`, `/settings/roles`, `/settings/users`, `/travel` | Asserted too: `/expenses?tab=mine&claim=`, `/leave$`, `/reports?r=headcount`, `r=training_expiry&withinDays=30` |
| Direct API | `GET leave/balances`, `GET leave/requests?scope=mine&pageSize=100` | `leave.e2e.ts:9-10`, `approval-delegation.e2e.ts:9-10` |
| Downloads | `<a>` with `waitForEvent('download')` | `reports.e2e.ts:37,44` |
| Exact copy in assertions | `only permissions you hold yourself`, `can only be granted by an administrator`, `must use two-factor authentication`, `Administrator only`, `1 day(s)`, `Casual Leave available`, ₹ amounts | Rewording fails tests |
| Labels | `Field` label association via wrapping `<label>` | Any Field rewrite must keep `getByLabel`; `{exact:true}` on `From`, `To`, `Name`, `Day 2` means hints must stay out of the accessible name or those fields stay hintless |

**Delete with SMS:** `e2e/sms.e2e.ts`.

**Lab-flavoured strings in tests** (`NABL`, `Mumbai audit`, instruments) are test input data and do not depend on UI wording. Assertions on seed data (`INST-2S`, `Meera Nair`) come from `backend:src/db/demo.ts`.

**Recommendation.** Before the redesign, add a small contract layer (`data-testid` for error, busy, tile value, stat value). Add a mobile project in the new shell. Migrate specs per screen as each screen is redone, not in one pass.

### f) SMS references to remove

**Frontend (this repo).**

| Location | What |
|---|---|
| `src/pages/SmsSettings.tsx` | Delete whole file (95 lines) |
| `src/pages/Settings.tsx:2,24,40` | Import, tab, route |
| `src/main.tsx:152` | `sms` state |
| `src/main.tsx:163-170` | Account SMS card (also the only use of `notifications.sms` outside Settings) |
| `src/auth.tsx:28` | `smsNotifications?` in `Me.preferences` |
| `e2e/sms.e2e.ts` | Delete whole file (17 lines) |
| `.github/workflows/e2e.yml:75` | `-e SMS_TRANSPORT=log` |
| `.github/workflows/e2e.yml:76` | `notifications.sms` in `ENABLED_MODULES` |

CSS has no SMS-specific rules. No other page mentions SMS (grep across `src`, `e2e`, docs, `docker`).

**Backend (frontend removal alone leaves these behind).** `src/modules/sms/routes.ts`; `src/core/notify/sms.ts`; `src/core/notify/service.ts` (`deliverSmsOutbox`); `src/core/jobs/scheduler.ts:7,107`; `src/core/features/registry.ts:83`; `src/core/features/state.ts:70-71,83-86`; `src/app.ts:40,48-49,82-83,195`; `src/core/http/context.ts:23` (`smsOverride`); `src/config/env.ts:55-62,137-139`; `src/modules/auth.ts` (`sms_notifications`, preferences); `test/sms.test.ts`; `test/features-settings.test.ts`. Tables `sms_templates` and `users.sms_notifications` need a migration decision.

**Deployment.** `environments/dev/docker-compose.yml:129-135`; `environments/dev/.env.example`; `terraform/modules/hrms-stack/compute.tf:147-155` and `variables.tf`, `database.tf`, `tests/stack.tftest.hcl`; `terraform/envs/customer/{main.tf,variables.tf,terraform.tfvars.example}`; `terraform/customers/_template.tfvars`; `docs/DEPLOYMENT.md`.

**Order:** frontend first (safe with the backend still present, since `/auth/me` extras are ignored), then backend, then deployment. If a removed env var stays set, check how `env.ts` treats unknown keys.

### g) Branding at runtime

**Two independent pipelines, both from deployment env, neither editable in the app.** Settings → Installation is read-only (`Settings.tsx:147`).

| Stage | Source | Applies | Evidence |
|---|---|---|---|
| Container start | `PRODUCT_NAME`, `BRAND_SHORT_NAME`, `BRAND_PRIMARY_COLOR`, `BRAND_FAVICON_URL`, `BRAND_LOGO_URL` on the **frontend** container | `<title>`, `application-name`, `theme-color`, favicon in `index.html`; logo/favicon origins in CSP `img-src` | `docker/40-hrms-runtime.sh:31-37,44-45` |
| Same | Same | `env.js` carries them, but only `environment` and `version` are used (env badge) | `:41`; `runtime/env.ts`; `main.tsx:39-40,277` |
| After boot | `GET /api/v1/public/config`, from `BRAND_*` on the **backend** | CSS vars `--brand`, `--brand-2`, `--brand-dark`; `document.title` | `auth.tsx:48-54,72-75`; `backend:src/config/installation.ts:34-42` |
| Render | `cfg.brand` | `BrandMark` logo or initials fallback (`main.tsx:43-50`); name, `loginMessage`, support links (`:52-61,68-71,90`) | `main.tsx` |

**Where colours land.**
- `--brand`: links, primary buttons, focus ring, active nav, active tab, `badge.info`, count pill, selected weekday (`styles.css:32,37,47,89,112,122,139,157`).
- `--brand-2`: only the login gradient and logo-initials gradient (`:43,130`).
- `--brand-dark`: nothing.
- Status colours are not brandable.

**Constraints for the redesign.**
- **`index.html` must keep `<!--hrms:head-->…<!--/hrms:head-->` on one line.** The container **fails to start** otherwise (`40-hrms-runtime.sh:36-38`). Keep `<script src="/env.js">` too.
- **Colours are arbitrary hex validated only for format.** Any palette must be derived at runtime: on-brand text, hover states, dark-mode variants. A fixed white on `--brand` is unsafe, and pre-computed shade scales will not work. `color-mix()` or a small JS contrast function in `applyBrand` is the path.
- **Dark mode needs its own brand handling** (§6.4).
- **External logos need `BRAND_LOGO_URL` on the frontend container too**, or CSP blocks them. Compose and terraform feed both from one variable (`docker-compose.yml:33-39`, `compute.tf:122,177`). `Settings.tsx:151` has no `onError`, unlike `main.tsx:46`.
- **Favicon from `/public/config` is ignored**, and the CSS brand applies only after the config fetch. Nothing branded paints before it except title, favicon and `theme-color`. If the new shell paints chrome before config loads, it will flash default colours. Applying `env.js` `primaryColor` early would fix this, and is the one reason to keep that field.
- **Web fonts must be self-hosted** (`font-src 'self'`).
- **`/branding/*` assets** are served by the backend through the proxy (`docker/nginx.conf:26` returns 404 if they ever reach nginx).

**Hard-coded wording that fights white-labelling.** The product is white-label, but these are not gated by `lab.competency`:

| Kind | Evidence |
|---|---|
| Lab defaults and options | `Assets.tsx:8,31,104,114,116,146` (`lab_instrument`, `INS-PH-05`, pH meter); `FieldDuty.tsx:10,29,80,114` (`field_sampling`); `Recruitment.tsx:11,121,255`; `Performance.tsx:227-228`; `Lifecycle.tsx:159`; `Competency.tsx:299`; `Settings.tsx:135`; `Roles.tsx:55`; `Rosters.tsx:109-110`; `AttendanceAdmin.tsx:211`; `PersonalDetails.tsx:32`; `Expenses.tsx:75,167,239`; `Overtime.tsx:99` |
| Locale fixed to India | `en-IN` at `format.ts:25,38`, `Dashboard.tsx:39,57`, `MyAttendance.tsx:37`, `Reports.tsx:15,239`; ₹ at `Expenses.tsx:162,164,255`, `Loans.tsx:86,166`, `Payroll.tsx:133,209,306`, `Travel.tsx:127,135,264`, `AllowanceRates.tsx:63`, `Recruitment.tsx:127,259,457` |
| India statutory (acceptable if India-only) | PF/ESI/PT/LWF/TDS (`Payroll.tsx:9-15`), POSH (`Cases.tsx:27,191`), GSTIN/CIN (`Settings.tsx:203,220,233`), IFSC (`Employees.tsx:229,242`), NEFT/UTR, Tally (`Accounting.tsx:18`) |

`NABL` and `ISO 17025` do not appear in `src` (only `e2e` test inputs).
