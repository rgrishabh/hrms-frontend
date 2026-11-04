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

## Audit claims that needed correcting

- **`style-src 'unsafe-inline'` is required by the inline styles (AUDIT 4.3): wrong for this app.** React applies the `style` prop through CSSOM on the client, which `style-src 'self'` permits. The directive is gone even though unmigrated pages still have inline styles. `e2e/mock/csp.mock.ts` visits all those pages under the strict policy with no violations.
- **Reset 2FA "no error handling":** the reset had a try/catch; Unlock was the one without. Both are handled now.

## Known issues, not fixed here

- **Exit interview for a non-HR employee (backend).** The API hides `exit_interview` from non-HR viewers, so an employee's form still opens blank, and their save replaces all recorded answers, including HR's. This needs a backend change: refuse or merge.
- **Other `Confirm` callers on unmigrated pages** (`Recruitment`, `Lifecycle`, `Cases`, `Policies`) still pass through local helpers that swallow errors, so those dialogs close on failure until the pages are migrated.
- **Double submit** is fixed on migrated pages by `Button loading`. Unmigrated forms keep it until migration.
