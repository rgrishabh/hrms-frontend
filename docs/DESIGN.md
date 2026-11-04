# Frontend design system

For anyone building or migrating a screen. Components live in `src/components`, one per concept, each with unit and axe tests.

## Principles

Clear, fast, restrained. Most content sits directly on the page, with hairline borders and little shadow. Brand colour marks the primary action and the current location, and nothing else. Numbers use tabular figures. There are no gradients.

## Tokens

`src/styles/tokens.css` holds colour, type, space, radius, shadow and motion as CSS variables. Use a token, never a literal.

Text sizes are in `rem` from a 16px root, so the browser's text-size setting works. Body text is 14px on desktop. Inputs are 16px on phones, which stops iOS zooming on focus.

### Runtime brand

`src/lib/brand.ts` writes brand variables to `:root` from `GET /api/v1/config/public`. `src/lib/color.ts` derives these for any hex, once for light surfaces and once for dark:

| Role | Guarantee |
|---|---|
| `solid`, plus hover and active | At least 3:1 against every surface |
| `on` (text on solid) | Black or white, at least 4.5:1 on solid, hover and active. Hover moves away from the text colour, so contrast only improves |
| `text` (links) | At least 4.5:1 on every surface |
| `ring` (focus) | At least 3:1 on every surface |
| `subtle`, `subtleText` | A tint, and text at least 4.5:1 on it |
| `50` to `900` | An even OKLCH ramp at the same hue |

`src/lib/color.test.ts` sweeps 741 colours in both themes and checks the static pairs in `tokens.css`. `e2e/mock/a11y.mock.ts` runs axe with real contrast in a browser, in both themes, with a dark green and a yellow brand.

Variables go through CSSOM because the CSP forbids `<style>` injection. `public/boot.js` sets `data-theme` before first paint, as an external file so `script-src 'self'` holds. Nothing branded paints before config loads, so there is no flash of the wrong colour.

### Fonts

`BRAND_FONT_FAMILY` must be one of the bundled fonts: **Inter** (default), **Source Sans 3** or **Noto Sans**. All are self-hosted variable fonts with `font-display: swap`, in Latin and Latin Extended. A face downloads only if it is used. An unknown name is ignored and the default stays.

## Choosing a component

| Need | Use |
|---|---|
| Action, or navigation that looks like one | `Button`, `ButtonLink`, `ButtonAnchor` for downloads |
| Text, with label, hint and error | `Input`, `Textarea`, `Checkbox`, or `Field` around a custom control |
| Short fixed list | `Select` |
| One record from a large list | `Picker` |
| Date, date and time, or month | `DatePicker` |
| Any server data | `useApiQuery` and `QueryState` |
| List of records | `Table`, with `useTableState` for page, sort, filters, columns and saved views |
| Search and filters above a list | `FilterBar` |
| Focused task | `Modal`. Side panel: `Drawer` |
| Yes or no before acting | `ConfirmDialog`. Add `typedConfirmation` for the irreversible |
| Result of an action | `useToast`. Failure inside a form: `InlineError` |
| Failed load | `ErrorState`, already inside `QueryState` |
| Nothing to show | `EmptyState` |
| A number with a meaning | `StatTile` in `StatGrid` |
| Status | `StatusBadge`, always words and never colour alone |
| Ordered progress | `Stepper` |
| File | `FileUpload` |
| Sensitive value | `MaskedValue` |

### Native controls: why

`Select` and `DatePicker` wrap native elements on purpose:

- Phones show their own picker and keyboard, which no custom widget matches.
- Keyboard, screen reader and form validation behaviour come free.
- Date values are always ISO, so no business logic parses display dates. Display format applies only to read-only values through `fmtDate`.
- `color-scheme` keeps the popups in the right theme.
- Playwright's `selectOption` and `fill` work.

The cost is less control over how the open list looks, which is the right trade for an HR form. `Picker` is custom only because no native control searches a server.

### Tables

Real `<table>` markup on desktop, so row and column semantics hold. Below 720px, a card list, so no action sits off-screen. Each column says where it goes with `card`: `title`, `subtitle`, `status`, `actions` or `hidden`. Anything else becomes a label and value row.

A row opens through a real link or button in its first cell, never by clicking the `<tr>`, which has no keyboard path.

Saved views store layout only (columns, sort, filter values) in `localStorage`, and never row data. Export is a hook, `onExport(format)`: the server generates the file.

### Dialogs

`Modal` and `Drawer` share `Dialog`:

- Focus moves in, is trapped, and returns on close.
- Only the top dialog answers Esc. A later dialog paints on top because it renders later.
- A form with typed input asks before discarding.
- A drag that starts inside does not close it.
- `persistent` is for content shown once, such as a device key.
- Modals are full-screen sheets on phones.

## Query state pattern

`QueryState` is the only path from a query to the screen. Its `children` runs only with data, so a null dereference cannot be written:

```tsx
const q = useApiQuery<Paged<Row>>(url);
<QueryState query={q} isEmpty={(d) => !d.items.length} empty={<EmptyState title="None yet" />}>
  {(d) => <Table ... rows={d.items} />}
</QueryState>
```

A refetch keeps the current data on screen. After a write, call `invalidateApi(prefix)`. Query data stays in memory and is cleared at sign-out.

## Errors

The API returns RFC 7807 only. `ApiError` carries `status`, `code`, `problem` and `errors`. `fieldErrors()` gives inline messages. Endpoint extras are extension members on `problem`. Any non-JSON body, such as a proxy 502, becomes a readable message.

## App shell

`src/app/registry.ts` is the single table behind routes, navigation, guards, breadcrumbs, the palette and the bottom bar. To add a page, add one entry.

- `flags`: the page exists when any is on. Off means no route at all, so the URL is a 404 and the chunk is never requested.
- `access`: who may enter. `any` is a permission; `self` also needs an employee record.
- `nav`: where it appears, per view and group, with what that placement needs.
- `load`: its lazy chunk.

**Views** are Employee, Manager, HR, Admin and Super-admin. They come from permissions, never role keys, because custom roles can combine anything. The switcher lists only views the person holds, and appears only with more than one. Single-person modes have no Manager view. Views shape the menu, not access: a page outside the current view still opens if `access` allows it.

**Breakpoints:** the phone shell (bottom bar, drawer) starts at 860px, card lists and sheets at 720px. Touch targets are 44px on phones and coarse pointers.

## PWA

- `/sw.js` is generated from `src/pwa/sw.template.js` at build. It caches the HTML shell and hashed assets, and never touches `/api`, `/brand`, `/branding` or `env.js`.
- The manifest and icon are rendered at container start from `.brandenv` by `docker/40-hrms-runtime.sh`, because `manifest-src 'self'` rules out `blob:` and `data:` manifests. `public/manifest.webmanifest` is the dev default.
- The offline state is a banner while working, and a clear screen if the app cannot load config.
- Push sits behind `FEATURE_PUSH_NOTIFICATIONS`. The worker ignores the payload, shows a generic message and stores nothing. **The endpoints in `src/pwa/push.ts` are placeholders until a later batch connects them.**

## nginx

Hashed assets are immutable for a year. The build writes `.gz` and `.br` next to each asset. The official image has `gzip_static` but no brotli module, so brotli is served by choosing the `.br` file with a `map` and setting `Content-Encoding` by hand. HTML, `sw.js`, the manifest and the icon are `no-cache`, and `env.js` is `no-store`. `/brand/` is routed like `/branding/`.

**Caddy (`environments/dev/Caddyfile`) and the production ALB must also send `/brand/*` to the backend.** That change belongs to the deployment repo.

## Decisions

**D1: CSS files, not CSS modules or a framework.** A prefixed class per component in a co-located file. Simple class names keep unmigrated pages and test selectors working, and add nothing to the bundle. Tailwind was rejected because it pushes literal styling back into markup.

**D2: Remove `unsafe-inline` now, not after the last page.** Options were to wait for full migration or remove it at once. React sets `style` through CSSOM, which the directive does not govern, and a browser test proves no violations on every page. So removing it costs nothing.

**D3: Compatibility layer `src/ui.tsx`.** Unmigrated pages keep their markup, but get the new dialogs, toasts and tabs, the reworked `useLoad`, and restyled classes in `styles/legacy.css`. This gives them focus traps and dark mode now, without half-migrating them. Delete both with the last page.

**D4: `useLoad` stays for unmigrated pages.** Reimplementing it on TanStack Query would need keys for closures, for no benefit before those pages move to `useApiQuery`.

**D5: Default view is the most privileged held.** Priority is Super-admin, HR, Admin, Manager, Employee. A person's main job is usually their widest view, and the choice is remembered. Self-service stays one switch away.

**D6: Device type decides the punch channel.** `pointer: coarse`, not viewport width, so a narrow desktop window no longer claims `mobile`. The backend's validation of channel was not checked.

**D7: Decisions live here.** The shared rules ask for `DECISIONS.md`, but this batch was told to create no docs beyond this file and `QA_REPORT.md`.

## Migration status

**Migrated:** Dashboard, MyAttendance, Leave, Payslips, Approvals (with Delegations), Notifications, Employees and employee profile, Documents, My profile (PersonalDetails), and Login, Setup, MFA, forced password change and My account.

**Not migrated, 19 screens:** Accounting, Assets, AttendanceAdmin, Cases, Competency, Expenses (with AllowanceRates), FieldDuty, Lifecycle, Loans, Overtime, Payroll, Performance, Policies, Recruitment, Reports, Rosters, Settings (with Roles), TeamAttendance, Travel. They received bug fixes only. A test in `src/app/registry.test.ts` holds migrated files to no `ui.tsx`, no inline style and no `any`.

To migrate a page: replace `useLoad` with `useApiQuery` and `QueryState`, tables with `Table`, forms with `Input` and friends, and `style={{}}` with utilities or a CSS file. Then add the file to the list in that test and move it from `UNMIGRATED` to `MIGRATED` in `e2e/mock/routes.ts`.

## Verifying

| Command | Covers |
|---|---|
| `npm run lint` | Types, including e2e |
| `npm test` | Units, axe in jsdom, page failure sweep, runtime script |
| `npm run build` | Type check and bundle |
| `npm run e2e:mock` | Production build with mocked API: real contrast, CSP, lazy chunks, layout at 360 to 768, service worker, screenshots |
| `npm run e2e` | Full stack, needs a backend with demo data |
