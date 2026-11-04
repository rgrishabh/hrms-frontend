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
| Result of an action | `useToast`, with an optional undo action. Failure inside a form: `InlineError` |
| Submitting a form | `useSubmit` for busy, field errors and the failure, `FormActions` for its end |
| One press on a row | `useAction` |
| An amount | `Money` in JSX, `formatMoney` in text. Nothing else formats money, and a test holds this |
| A file from the API | `DownloadButton` |
| An employee | `EmployeeField`. Branch, department, legal entity: `useOrg` |
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
- Push sits behind `FEATURE_PUSH_NOTIFICATIONS`. The worker ignores the payload, shows a generic message and stores nothing. Without VAPID keys the server answers 409 `feature_not_configured`, which the toggle shows.

## nginx

Hashed assets are immutable for a year. The build writes `.gz` and `.br` next to each asset. The official image has `gzip_static` but no brotli module, so brotli is served by choosing the `.br` file with a `map` and setting `Content-Encoding` by hand. HTML, `sw.js`, the manifest and the icon are `no-cache`, and `env.js` is `no-store`. `/brand/` is routed like `/branding/`.

**Caddy (`environments/dev/Caddyfile`) and the production ALB must also send `/brand/*` to the backend.** That change belongs to the deployment repo.

## Decisions

**D1: CSS files, not CSS modules or a framework.** A prefixed class per component in a co-located file. Simple class names keep unmigrated pages and test selectors working, and add nothing to the bundle. Tailwind was rejected because it pushes literal styling back into markup.

**D2: Remove `unsafe-inline` now, not after the last page.** Options were to wait for full migration or remove it at once. React sets `style` through CSSOM, which the directive does not govern, and a browser test proves no violations on every page. So removing it costs nothing.

**D3, D4: compatibility layer and `useLoad`.** Served their purpose in batch 1. Both were deleted with the last unmigrated page in batch 2.

**D5: Default view is the most privileged held.** Priority is Super-admin, HR, Admin, Manager, Employee. A person's main job is usually their widest view, and the choice is remembered. Self-service stays one switch away.

**D6: Device type decides the punch channel.** `pointer: coarse`, not viewport width, so a narrow desktop window no longer claims `mobile`. The backend's validation of channel was not checked.

**D8: Browser checks show at the field.** `Field` catches the `invalid` event, cancels the bubble and shows the browser's message inline. Every form gets `required`, `min` and `pattern` errors in the same place with no code per form. `useSubmit` adds checks the browser cannot express and the server's field errors. It clears on the bubble phase, because clearing in the capture phase reset a controlled value and lost the first keystroke (QA-012).

**D9: `Money` is the only way amounts reach the screen.** `money()` is called from one file. Masking can arrive later by changing that file. `formatMoney` covers toasts and labels, which cannot hold an element. Options were a CSS mask (leaks to the DOM) or per-page handling (misses cases).

**D10: Downloads are fetched, not linked.** A plain link replaces the app with raw JSON when the server refuses. The cost is that the file is held in memory, which is fine for these sizes.

**D11: Selfie only when required, photo reused on retry.** No camera opens unless `selfieRequired` is true, since a photo nobody asked for is data nobody should hold. An uploaded photo is reused when the clock-in fails, because it is linked only on success. A blocked or missing camera falls back to the device's photo picker, because the backend only needs an image. So a required selfie is not proof of a live capture: `capture="user"` is a hint that browsers can ignore.

**D12: Location failure is stopped in the browser when location is required.** The server would refuse anyway, and it cannot say how to fix a blocked permission. When location is optional the clock-in goes on without it.

**D13: Settings tabs are links.** Each section has its own URL, so `nav.tabs` with real links stays, rather than `role="tab"`.

**D14: Phone roster.** A team lists one chosen day and one person lists all their days, because a 15-column grid has no phone form.

**D15: Payroll runs page on the client.** The server caps the list at 100 and has no pager. Run detail deep-links with `?run=`.

**D16: Offer edit matches the branch by name.** Offer rows carry no ids for branch, department or legal entity, so the form matches the branch by name, takes the department from the requisition, and says so. Contract end must be retyped. A backend change returning `legal_entity_id`, `department_id` and `contract_end_date` would remove this.

**D17: Reset on tab change by key.** Lists with scopes are keyed by tab, so page and filters cannot leak between tabs.

**D18: Cases respondent.** A complaint's respondent uses `EmployeeField` because the API takes an employee id and `cases/people` needs admin permission. Handler and committee pickers use `cases/people`.

**D7: Decisions live here.** The shared rules ask for `DECISIONS.md`, but this batch was told to create no docs beyond this file and `QA_REPORT.md`.

## Migration status

Every screen is on the design system. `src/app/registry.test.ts` scans `src/pages` and `src/features` and fails on a legacy import, an inline style, `any`, a clickable `<tr>`, a raw badge or table, or a browser dialog. The only raw tables are the team calendar and payslip lines, which are data grids with their own phone layout.

Not yet built, by instruction: L4 masking and mode-specific menus. Backend batch C is defining those contracts.

## Verifying

| Command | Covers |
|---|---|
| `npm run lint` | Types, including e2e |
| `npm test` | Units, axe in jsdom, page failure sweep, runtime script |
| `npm run build` | Type check and bundle |
| `npm run e2e:mock` | Production build with mocked API: real contrast, CSP, lazy chunks, layout at 360 to 768 with long real rows, service worker, screenshots. Each group's rows and screens are in `e2e/mock/fixtures/` |
| `npm run e2e` | Full stack, needs a backend with demo data |
