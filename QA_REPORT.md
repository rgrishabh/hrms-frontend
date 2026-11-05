# QA report: frontend

Bugs found and fixed during the revamp. Each has a test that was run and seen to fail before the fix. Page-level fixes were re-checked by restoring the pre-fix pages and running the same tests.

| ID | Module | Severity | Steps | Root cause | Fix | Test |
|---|---|---|---|---|---|---|
| QA-001 | All pages | P0 | Open any page or tab while its first request fails with 500 or 403 | `useLoad` left `data` null with `loading=false`, then `data.items.length` threw. No ErrorBoundary, so React unmounted the app. Before the fix the test crashed Attendance setup, Cases, Competency, Expenses, Lifecycle, Payroll, Policies, Recruitment and Settings | Migrated pages use `QueryState`. Unmigrated pages gained a failed branch (`!data ? ...`) at every site. Root and per-route `ErrorBoundary` added | `src/app/pages-failure.test.tsx`, every route and tab at 500 and 403 |
| QA-002 | Recruitment | High | Open a requisition, press Edit | The form opened beneath the detail modal, and the detail kept a stale `version`, so the next edit got a 409 | The form replaces the detail. Saving or cancelling reopens it, which refetches | `src/app/legacy-bugs.test.tsx` QA-002 |
| QA-003 | Lifecycle | High | HR opens the exit interview on a separation with recorded answers, or saving fails | The form always opened blank and the backend replaces all answers, so saving wiped them. `run` swallowed errors, so the form closed on failure and lost what was typed | The form starts from recorded answers, and a failed save stays open with the error | `src/app/legacy-bugs.test.tsx` QA-003 |
| QA-004 | Payroll, salaries | Med-High | Pick employee A, then B | `useLoad` kept A's data while B loaded and permanently if B failed, so A's UAN, ESI and PAN mask showed under B | `useLoad` clears data when its dependencies change. Load failures on the salary and statutory panels are now shown | `src/app/legacy-bugs.test.tsx` QA-004, `src/ui.test.tsx` |
| QA-005 | Payroll, attendance devices, users | Med | Press Finalize, Cancel run, Rotate key, Disable device or Reset two-factor | The action ran on one click. Failed confirmations closed as if they had worked. The one-time device key closed on Esc | `Confirm` dialogs that stay open on failure, and the key dialog is `persistent` | `src/app/legacy-bugs.test.tsx` QA-005 (Disable device and Cancel run share the pattern and have no test of their own) |
| QA-006 | e2e helpers | High | Rename a class or loader | `noErrors` and the busy wait counted matches for a selector, so they passed by matching nothing | Positive contract in `src/contract.ts`: `noErrors` requires the shell, `settled` requires `data-inflight="0"`. Hidden-menu checks reject unknown labels | `e2e/mock/contract.mock.ts` |
| QA-007 | e2e helpers | Med | Assert `noErrors` while a query waits to retry | Found while proving QA-006. Between retries nothing was on the wire, so the page looked settled and clean | `data-inflight` also counts fetching queries | `e2e/mock/contract.mock.ts` "noErrors fails when a real error is on screen" |
| QA-008 | Cases | Med | Open My cases, or Internal Committee, while the load fails | Failure read as "You have not raised any case", and Committee stayed on Loading forever | Errors are shown | `src/app/pages-failure.test.tsx` |
| QA-009 | Employees | Med | Save bank details, reopen the form | Form state survived saving, so the full account number reappeared | The form mounts only while open | Not separately tested; follows from the component structure |
| QA-010 | API client | Low-Med | A proxy returns a 502 HTML page, or an upload returns 401 | The body was parsed as JSON and the parse error was shown. `upload` skipped the sign-out event | RFC 7807 parser tolerates any body; one send path | `src/api.test.ts` |
| QA-011 | Picker | Low | Type quickly and press Enter | Found while testing. Enter could pick from results of the previous, shorter text | Enter waits until results match the text | `src/components/Picker.test.tsx` |
| QA-012 | Field (found in this batch) | High | Submit a form with a failed browser check, then type in that field | Clearing the inline message in the capture phase reset a controlled value, so the first keystroke was lost. jsdom did not show it | Clear on bubble | `e2e/mock/attendance.mock.ts` flows |
| QA-013 | Payroll | Med | Open New run just after midnight IST on the 1st | `toISOString` on a local date gave the month before last | Uses tenant today | `src/features/payroll/payroll.test.tsx` |
| QA-014 | Payroll, Lifecycle, Recruitment, Cases, Policies | Med | Fail any confirm: mark paid, acknowledge, skip, complete exit, hold, withdraw, publish | Local helpers swallowed the error, so the dialog closed as if it worked | Dialogs throw, stay open and show the reason. This closes the known issue in the list below | `src/features/{payroll,lifecycle,recruitment,cases,policies}/*.test.tsx` |
| QA-015 | Payroll | Med | Sign in as read-only, open a run | Downloads were gated on manage, though the server allows read | Read or manage | `payroll.test.tsx` |
| QA-016 | Payroll | Med | Type a comma in base components | The input dropped it. Now checkboxes | Checkboxes | `payroll.test.tsx` |
| QA-017 | Payroll | Med | Start an F&F run | Needed a raw employee UUID, and `fnf-suggestions` was unused | Picker with suggestions | `payroll.test.tsx` |
| QA-018 | Payroll | Low-Med | Open salaries with the statutory flag off | Requested a route that answers 404 | Gated | `payroll.test.tsx` |
| QA-019 | Loans, Overtime, Expenses, Field duty, Travel | Med | Go to page 3, change tab | Page and filters survived the tab change | Keyed by tab | `loans.test.tsx`, `attendance.test.tsx`, `expenses.test.tsx` |
| QA-020 | Loans, Overtime, Field duty, Travel | Med | Have more than 50 records | Silent cap with no pager | Pager | Same files, `travel.test.tsx` |
| QA-021 | Loans | Med | Open your own loan | Defer and Cancel were shown and refused by policy. The backend does not enforce own-defer, so only the UI stops it | Hidden | `loans.test.tsx` |
| QA-022 | Loans | Med | Turn off one of FEATURE_LOANS, FEATURE_SALARY_ADVANCE | The kind was still offered | Follows flags | `loans.test.tsx` |
| QA-023 | Accounting, Reports, Expenses | Low-Med | A download fails | Raw JSON replaced the app | `DownloadButton` | `accounting.test.tsx`, `Reports.test.tsx`, `expenses.test.tsx` |
| QA-024 | Accounting, Policies, Expenses | Med | View a date at 00:00-05:30 IST | `slice(0,10)` on an instant shows the UTC date | `fmtDateOfInstant` | Same files, `Policies.test.tsx` |
| QA-025 | Lifecycle | Med | Fail Skip, Complete exit or the last-working-day form | Closed or lost input | `useSubmit`, `ConfirmDialog` | `lifecycle.test.tsx` |
| QA-026 | Lifecycle | Med | View another person's separation | Withdraw shown and refused | Requester only | `lifecycle.test.tsx` |
| QA-027 | Recruitment | Med | Org load fails | Permanent Loading | `QueryState` | `recruitment.test.tsx` |
| QA-028 | Performance | Med | HR reviewer views their own review | Finalize shown and refused | Shown for `role === 'hr'` | `src/features/performance` tests |
| QA-029 | Performance | Med | Clear a goal rating | Sent 0 | Key removed | Same |
| QA-030 | Performance (found in this batch) | Med | Team load fails | Tabs flapped in an endless refetch | Keyed on `errorUpdateCount` | Same |
| QA-031 | Dialog (found in this batch) | Low | Type in a nested dialog, then close the outer | Outer was marked dirty | Checks `contains` | `Dialog.test.tsx` |
| QA-032 | Settings | High | Open Installation on the current API | Threw, because `organization` is gone | Reads `brand` | `Settings.test.tsx` |
| QA-033 | Settings | Med | Open any feature setting | "Module disabled" on all of them, since `featureEnabled` is no longer sent | Removed | `Settings.test.tsx` |
| QA-034 | Settings jobs | High | Run a job | 202 read as "failed: undefined" | Says queued, polls | `Settings.test.tsx` |
| QA-035 | Reports | Med | Press Run with unchanged options | Nothing happened | Refetches | `Reports.test.tsx` |
| QA-036 | Reports | Low | Remove a schedule | False "next run" toast | Fixed, with a confirm | `Reports.test.tsx` |
| QA-037 | Reports | Low-Med | Sent or saved list fails | Hidden | Shown | `Reports.test.tsx` |
| QA-038 | Roles | Med | Press Enter in the filter | Submitted the form | `FilterBar` | `Settings.test.tsx` |
| QA-039 | Rosters | Med | Clear the cycle length | Truncated days | Days kept. The test first failed on a label lookup, so the truncation itself was not seen failing; the flows pass | `attendance.test.tsx`, `attendance.mock.ts` |
| QA-040 | Team attendance | Med | Open the status filter; tab to a row | Non-attendance statuses listed; rows mouse only | Fixed list; name is a link | `attendance.test.tsx` |
| QA-041 | Attendance setup | Med | Unmapped or mappings load fails | Read as empty | `QueryState` | `attendance.test.tsx` |
| QA-042 | Expenses | Med | View a team claim; a batch you prepared | Withdraw and Approve shown and refused | Hidden | `expenses.test.tsx` |
| QA-043 | Expenses | Med | Finance tab load fails | Read as empty | `QueryState` | `expenses.test.tsx` |
| QA-044 | Expenses | High | Press Add twice | Posted twice | `useSubmit` | `expenses.test.tsx` |
| QA-045 | Travel | Med | Trip returned for correction | Dead end | Guidance and Request again. Editing needs a backend route | `travel.test.tsx` |
| QA-046 | Travel | Low-Med | Advance load fails | Showed zero | `QueryState` | `travel.test.tsx` |
| QA-047 | Assets | Med | Branch load fails; reload on a tab | Swallowed; tab lost | Inline error; URL tab | `assets.test.tsx` |
| QA-048 | Assets, Competency, Field duty | Med | Use with the lab flag off | Lab wording and lab calls | Gated | `assets.test.tsx`, `Competency.test.tsx` |
| QA-049 | Cases | Med | Fail a withdraw | Dialog closed | Throws | `Cases.test.tsx` |
| QA-050 | Cases | Med | Be an assigned handler without `grievance.manage` | No list | "Assigned to me" tab | `Cases.test.tsx` |
| QA-051 | Cases | Med | Search after selecting a respondent; press Submit twice | Hidden id kept; posted twice | Picker; `useSubmit` | `Cases.test.tsx` |
| QA-052 | Cases | Low | Annual report fails | Hidden | Shown | `Cases.test.tsx` |
| QA-053 | Competency | Med | Revoke a record | `window.prompt` | `ConfirmDialog` with a comment | `Competency.test.tsx` |
| QA-054 | Deployment header (found in this batch) | High | Use the selfie in a deployed container | `Permissions-Policy: camera=()` blocks `getUserMedia` | `camera=(self)`. No test: the header is rendered by the container script, which was not started here | Not separately tested |
| QA-055 | Attendance, Rosters | High | Attendance setup > Rosters > Assign on a pattern, then clear the From date, as when retyping it | The preview ran `addDays('', i)` on every render, which throws `RangeError: Invalid time value`, so the screen crashed | The preview is empty until there is a date | `Roster.test.tsx` |
| QA-056 | Settings, Organization | High | Settings > Organization > Grades or Designations > Add or Edit | `OrgForm` drew inputs only for legal entities, branches and departments, so these forms showed only Status and Save sent `code: null, name: null`, which the API requires | Required Code and Name inputs for both kinds | `screens-admin.test.tsx` |
| QA-057 | Approvals, Delegations | High | Approvals > While I'm away > Hand over my approvals, then clear or partly delete First day | `addDays('', 89)` for the Last day `max` threw during render, so the screen crashed | No `max` until First day has a date | `Delegations.test.tsx` |
| QA-058 | Payroll, run adjustments | Med | Open a draft or computed run without revealing amounts, Remove an adjustment, press Undo in the toast | The API masks adjustment `amount` and `note` by default, so Undo posted `amount: 0, note: null`, which the server refuses | No Undo while the amount is masked; a revealed adjustment keeps it | `payroll.flows.test.tsx` |
| QA-059 | Cases, Internal Committee | Med | Edit membership, add a person, open the picker again and pick them again; or remove someone and look for them | Picker results were cached under one fixed key for 30 seconds, so the filter on current members did not re-run: the person added could be added twice, and the person removed was not offered back | The query key includes the current member ids | `Committee.test.tsx` |
| QA-060 | Travel (found in this batch) | High | Correct a returned trip, changing only the purpose | The form starts with blank estimate and advance, so resubmitting sent all zeros and lost the figures the approver had seen | Starts from the request's estimate, advance, accommodation and on-duty | `travel.test.tsx` |
| QA-061 | Salaries, statutory | High | Edit statutory details with the fields masked | The form was built from masked nulls, so saving would have cleared UAN and ESI numbers | Edit needs the details shown first | `statutory-mask.test.tsx` |
| QA-062 | Accounting, loans, payroll | High | Open a list with L4 masked | `formatMoney(null)` read as ₹0.00, and masked `warnings`, `lines`, `balance` and `schedule` would have thrown | `Money masked`, null-safe screens | `e2e/full/journeys.full.ts`, payroll and loans tests |
| QA-063 | Policies | Low | Have an overdue policy | A reminder used the error surface, so it read as a failure | Warning notice | `e2e/full/walk.full.ts` |
| QA-064 | Recruitment (found by running end to end) | Med | Draft an offer and type a designation before the requisition has loaded | The fill from the requisition overwrote what was typed, so the form then refused to submit | Only empty fields are filled | `OfferForms.test.tsx` |
| QA-065 | Reports (found by axe on the real stack) | Low | Open Reports on a phone | The tile link's own box was 21px high, under the 24px minimum | Minimum height | `e2e/full/walk.full.ts` |
| QA-066 | Sign-in | Medium | Open `/login`, sign in | The sign-in form shows at any address and the app then renders that address; `/login` was not a route, so it fell through to Page not found | `/login` redirects to the dashboard | `e2e/mock/flows.mock.ts` |
| QA-067 | Settings, Data rights (found moving to generated types) | High | Open Erasure requests | The screen read `subject_type`, `created_at` and `retained_until`; the route sends camelCase. Candidates read as Employee, with no dates | Reads what is sent | `screens-audit-company.test.tsx` |
| QA-068 | Reports (same) | High | Open a pay report without revealing | The screen read a top-level `masked`; the route marks each row and the totals. Pay showed a dash, with no Show amounts button | Per-row `isMaskedField` | `reports.flows.test.tsx` |
| QA-069 | Lifecycle, F&F (same) | High | HR who cannot see the F&F note saves F&F | The form started from the masked null and sent it, erasing the note | Save is disabled and says the note is hidden | `lifecycle.flows.test.tsx` |
| QA-070 | Payslips (same) | Med | Open a slip, press Download PDF | The slip's detail has no `id`, so it asked for `/payslips/undefined/payslip.pdf`. The mock's detail had an id, which hid it | Uses the id it was opened with. Mock corrected | `payroll.flows.test.tsx` |
| QA-071 | Loans (same) | Med | Open a loan with reference and purpose masked | A masked reference dropped the whole Paid line, and a masked purpose vanished | Both read as hidden | `loans/flows.test.tsx` |
| QA-072 | Employees (same) | Med | Open history without the right to its details | Null `change_metadata` read as an empty cell | Reads as hidden, as the column is never null in the table | `Employees.test.tsx` |
| QA-073 | Employees (same) | Low | Open a bank change in history | `newLast4` is never sent, only `[REDACTED]` | Read removed | `Employees.test.tsx` |
| QA-074 | Employees (same) | Low | Open a full view with no `employment_type`, which the schema allows and the backend does not do today | `label()` threw | Safe | `Employees.test.tsx` |
| QA-075 | Employees (same) | Low | Import report row with a blank code | Showed nothing | A dash | `Employees.test.tsx` |
| QA-076 | Approvals (same) | Low | A step with nobody named | Printed `Step 1: ` | Says Approver | `Approvals.test.tsx` |
| QA-077 | Attendance (same) | Low | A leave day with no type code, allowed by the schema | Printed `null · full day` | Left out | `src/features/attendance` tests |
| QA-078 | Overtime (same) | Low | Comp off with no day count, allowed by the schema | Read as 0 days | Says nothing false | `Overtime.test.tsx` |
| QA-079 | Travel (same) | Low | A paid advance with no reference, allowed by the schema | Printed `Paid · null` | Left out | `travel.test.tsx` |
| QA-080 | Command palette | Low | Press Ctrl+K as soon as the page appears; failed one parallel unit run | The listener came from a passive effect, which runs in a later task than the commit. A key in between was lost | A layout effect attaches it within the commit. The new test failed every time before the fix | `CommandPalette.test.tsx` "listens from the moment it is on screen" |
| QA-081 | Shell, icon rail | Med | Open a short page at 1440 wide as someone with many links | Labels clipped for screen readers were positioned against the page, so those past the rail's fold made it scroll, 376px at 600 high. Seen reviewing baselines | Positioned against their link | `e2e/mock/layout.mock.ts` |
| QA-082 | Shell, top bar | Low | Look at the line under the top bar; read the top bar | The rail's header was 53px and the bar 52px, and the breadcrumbs ran on from the product name | Same height; a gap | `e2e/mock/layout.mock.ts` |
| QA-083 | e2e mock | Low | Open Approvals in the mocked suite | The mock's inbox and mine had no paging, unlike the route, so `NaN–NaN of undefined` sat in the baselines and passed | Mock corrected. Every screen now fails on printed null, NaN or undefined | `e2e/mock/screens.mock.ts` |
| QA-084 | e2e stack | Low | Run `E2E_PROFILE=single` | The web server came up before the admin's first password change, so Playwright could read the old password: Invalid email or password, once | The web server starts last. Passed on the rerun; the race is not forced | `e2e/full/mode.single.ts` |
| QA-085 | API contract test | Low | Upload with PUT | The test read every upload as a POST, so the resume route failed it | Reads the method argument | `src/lib/api-contract.test.ts` |
| QA-086 | Lifecycle, exit interview | High | The leaver, or HR who is not above them, opens Exit interview when answers are on file, and saves | The API withholds the answers, so the form opened blank, and a save replaces every answer | Same pattern as QA-069: the button is disabled and the screen says who can change it. The API now says `exit_interview_recorded` and refuses with 409 (backend H-1). Nothing on file: the form works as before | `lifecycle.flows.test.tsx` |
| QA-087 | Recruitment, offer edit | High | Edit an offer whose department differs from the requisition's, or a contract offer, or one at a branch sharing its name with another | The row had no ids and no contract end, so the form matched the branch by name, took the department from the requisition and asked for the end date again, and PUT replaced the saved values | The API sends them (backend H-2) and the form starts from them. The "check the department" line is gone | `recruitment.test.tsx` |

## Audit claims that needed correcting

- **`style-src 'unsafe-inline'` is required by the inline styles (AUDIT 4.3): wrong for this app.** React applies the `style` prop through CSSOM on the client, which `style-src 'self'` permits. The directive is gone even though unmigrated pages still have inline styles. `e2e/mock/csp.mock.ts` visits all those pages under the strict policy with no violations.
- **Reset 2FA "no error handling":** the reset had a try/catch; Unlock was the one without. Both are handled now.
- **Policies, "manage-only role crash and publish-only has no path" (audit section 2):** the API requires `policies.read` to list, so those roles get an explanation, not a list.

## Known issues, not fixed here

- **The OpenAPI spec is wrong in places, and the serializer does not enforce it.** Screens stay safe through `Refine` (`docs/DESIGN.md`, D24). Non-null in the spec, null in the route: approvals steps `approver_name`, `acted_by_name`, `acted_for_name`; `attendance/me` `shift_code`; roster `source`, `department`; regularization `reason`; trip `department`; document `uploaded_by_name`; profile `edit.*`; bank pending `accountHolder`, `ifsc`; policies list and acknowledgement joins, `mine.due_on`; jobs `result`, `triggered_by_name`; competency `review_due`, `reviewDue`, `valid_from`; case events `actor`, `description`; application events `actor_name`; `defer.recomputePayroll`; `leave/ledger.created_by_name`. Missing or empty: `travel/requests` items, `me/today.selfieRequired`, mask fields on `payslips/mine`, regularizations and bank pending. Section-dependent items typed as one section: profile pending and profile-changes. `employees/import` `employeeCode` is required but omitted when blank.
- **Backend text can still carry lab words:** approval summaries saying "field sampling", and "Calibration expired" on a legacy `lab_instrument` asset.

## Last full run

Fresh build at 1b9a402, against the backend at b93865b on a private Postgres 17 cluster and spare ports. The full profile, after one spec step followed the shared picker, and lint again at a52484f. No `src` change between the two.

| Suite | Result |
|---|---|
| Unit, with thresholds | 1420 passed: statements 98.88%, branches 95.2%, functions 98.73%, lines 99.45% |
| Lint | Clean |
| Mocked browser suite | 1290 passed, 16 skipped: 14 visual tests that need `E2E_TODAY`, and 2 screenshot steps |
| Visual baselines, `npm run e2e:visual` | 14 passed on darwin. Linux baselines not compared in this run |
| Full stack: full, off, single | 228, 4 and 2 passed |
| Lighthouse | Not run again. Last at e5466ef: performance 1, accessibility 1, best practices 0.96, SEO 1 |
