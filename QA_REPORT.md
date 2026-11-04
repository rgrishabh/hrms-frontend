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

## Audit claims that needed correcting

- **`style-src 'unsafe-inline'` is required by the inline styles (AUDIT 4.3): wrong for this app.** React applies the `style` prop through CSSOM on the client, which `style-src 'self'` permits. The directive is gone even though unmigrated pages still have inline styles. `e2e/mock/csp.mock.ts` visits all those pages under the strict policy with no violations.
- **Reset 2FA "no error handling":** the reset had a try/catch; Unlock was the one without. Both are handled now.
- **Policies, "manage-only role crash and publish-only has no path" (audit section 2):** the API requires `policies.read` to list, so those roles get an explanation, not a list.

## Known issues, not fixed here

- **Exit interview for a non-HR employee (backend).** The API hides `exit_interview` from non-HR viewers, so an employee's form still opens blank, and their save replaces all recorded answers, including HR's. This needs a backend change: refuse or merge.
- **The backend at HEAD still answers `{ error: { code, message, details } }`, not RFC 7807** (`hrms-backend/src/app.ts:149`). The client reads only RFC 7807, as the contract says, so until that handler changes people see generic messages, field errors do not reach fields, and `outside_geofence`, `selfie_required` and `feature_not_configured` are not recognised.
- **Own-defer on a loan** is hidden in the UI, and the backend does not enforce it.
- **A travel return cannot be edited.** The traveller gets guidance and can request again; editing needs a backend route.
- **Released-pay bank file** shows on every closed run, because the API does not say whether anything was released.
- **A `users.manage` administrator cannot find stuck approvals.** Reassign works from the inbox, and no route lists requests stuck on someone else.
- **Backend text can still carry lab words:** approval summaries saying "field sampling", and "Calibration expired" on a legacy `lab_instrument` asset.
