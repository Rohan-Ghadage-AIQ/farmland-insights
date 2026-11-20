# Design

Scope of this file: the design system and app shell (spec section 3.6 and 3.2). Sections for data colour scales (colour-blindness checks) and the Phase 7 checklist are added by the tracks that own them, below the marker at the end.

## Principles

- Quiet chrome. Neutral grays carry the interface; colour is for data and the single primary action.
- Success, warning and danger colours are for system status only, and are never the only signal: each comes with an icon or words.
- One elevation level. Floating layers (popover, dialog, drawer, toast, listbox) use `--shadow`; everything else is flat and separated by borders.
- Light theme first. Dark follows the OS (`prefers-color-scheme`) and can be overridden by a manual toggle.

## Tokens

Source of truth: `src/styles/tokens.css`. Tailwind utilities are mapped in `src/styles/globals.css` (`bg-surface`, `text-fg-muted`, `rounded-control`, `shadow-float`, `text-sm`, ...).

| Group              | Tokens                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neutral            | `--bg`, `--surface`, `--surface-muted`, `--fg`, `--fg-muted`, `--border` (decorative dividers), `--border-strong` (control boundaries)                          |
| Accent (one)       | `--accent`, `--accent-fg`, `--accent-subtle`, `--ring` (focus ring)                                                                                             |
| Status             | `--success`, `--warning`, `--danger`, each with a `-bg` tint                                                                                                    |
| Spacing (4px base) | `--space-1/2/3/4/6/8/12` = 4/8/12/16/24/32/48px                                                                                                                 |
| Radius             | `--radius-control` 6px, `--radius-panel` 10px                                                                                                                   |
| Type               | `--font-size-xs/sm/base/md/lg/xl` = 12/13/14/16/20/24px (+ matching line heights); Inter or the system UI stack; `font-variant-numeric: tabular-nums` on `body` |
| Elevation          | `--shadow` (the only one)                                                                                                                                       |
| Layout             | `--topbar-height` 56px, `--setup-width` 360px, `--inspector-width` 380px                                                                                        |
| Motion             | `--duration-fast`, `--duration-base`; all animation collapses under `prefers-reduced-motion: reduce`                                                            |

### Themes

- Light values live in `:root`.
- Dark values are defined twice with identical content: once under `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) }` and once under `:root[data-theme='dark']`. `tokens.test.ts` fails if they drift.
- `ThemeProvider` (`src/app/theme/`) sets `data-theme` on `<html>` only when the user has chosen; with no choice the attribute is absent and CSS follows the OS. The choice is stored under `fi-theme` in `localStorage` through a try/catch wrapper (`theme-storage.ts`); if storage is blocked the toggle still works for the visit. `useTheme()` exposes the resolved theme for code that must follow it (the basemap switch).

### Contrast (verified numerically)

`src/styles/contrast.ts` implements the WCAG 2.x formula; `src/styles/tokens.test.ts` checks both themes:

- Text pairs at least 4.5:1: `fg`/`fg-muted` on `bg`, `surface` and `surface-muted`; `accent` on `bg`, `surface` and `accent-subtle`; `accent-fg` on `accent`; each status colour on `bg`, `surface` and its own `-bg` tint.
- UI pairs at least 3:1: `border-strong` against `bg` and `surface`; `accent` (focus ring, selected marks) against `bg`, `surface` and `surface-muted`.
- Browser check: `tests/e2e/a11y-ui.spec.ts` runs axe (WCAG 2.0/2.1/2.2 A and AA tags) against `/dev/ui`, `/` and `/login` in light and dark, the narrow-window drawer, and open dialog, drawer, combobox list, calendar and toast. Zero violations of any impact at the time of writing.

Known limit: axe cannot evaluate contrast of text over a map or of disabled controls (disabled controls are exempt from WCAG contrast).

## Primitives (`src/components/ui`)

Import from `@/components/ui`. Each has tests next to it. Built on Radix where a primitive exists; the combobox, number field and calendar follow the ARIA Authoring Practices patterns directly because Radix has no equivalent.

| Primitive                 | Notes                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                  | Variants `primary` (one per screen), `secondary`, `ghost`; sizes `sm`, `md`. `disabled` sets `aria-disabled` and blocks clicks but keeps focus, so a tooltip can say why (for example what Analyze is missing). A disabled submit button does not submit. `loading` keeps the label, shows a spinner, sets `aria-busy`. `asChild` renders a link with the button look. |
| `IconButton`              | Requires `label` (accessible name and tooltip). `pressed` for toggles. `tooltip={false}` inside dialogs and toasts.                                                                                                                                                                                                                                                    |
| `TextField`, `TextArea`   | Label, description, inline error (`aria-invalid` + `aria-describedby`), required marker, suffix, disabled, read-only.                                                                                                                                                                                                                                                  |
| `NumberField`             | `role="spinbutton"` with `aria-valuenow/min/max`. Reports valid numbers while typing, clamps (and rounds when `integer`) on blur, steps with buttons and arrow keys, never invents a value for an empty field.                                                                                                                                                         |
| `Combobox`                | ARIA 1.2 combobox with `aria-activedescendant`. Matches label and `keywords` (English and desi names), case and accent insensitive. Optional `group` headings (for example Recent first). Escape closes the list without closing an enclosing dialog.                                                                                                                  |
| `DateRangePicker`         | Popover calendar, Monday first, two-click range, presets, `minDate`/`maxDate` with a written reason shown in the calendar, full arrow/PageUp/PageDown/Home/End keyboard support, shows the length in days. Dates are ISO strings computed in UTC (`date-utils.ts`).                                                                                                    |
| `Slider`                  | Radix slider with visible formatted value and `aria-valuetext`.                                                                                                                                                                                                                                                                                                        |
| `Tabs`                    | Radix tabs; the selected tab is marked by a border, not a shadow.                                                                                                                                                                                                                                                                                                      |
| `Tooltip`                 | Supplementary text only; opens on hover and keyboard focus; Escape closes. Brings its own provider.                                                                                                                                                                                                                                                                    |
| `Toast`                   | `ToastProvider` + `useToast()`. Tones carry an icon and a visually hidden word. Danger and warning interrupt screen readers; others are polite. For background and async events, never validation.                                                                                                                                                                     |
| `Dialog`, `Drawer`        | Radix dialog: focus trap, Escape, scrim, and focus returned to whatever opened it (Radix only does that for its own trigger, so this is handled explicitly). Drawer opens from the right or left.                                                                                                                                                                      |
| `Badge`                   | Tones neutral, accent, success, warning, danger; optional dot.                                                                                                                                                                                                                                                                                                         |
| `Skeleton`                | Decorative block or text lines, hidden from assistive technology.                                                                                                                                                                                                                                                                                                      |
| `EmptyState`              | Title, description, action; heading level is a prop to keep the outline valid.                                                                                                                                                                                                                                                                                         |
| `ErrorBanner`             | `role="alert"` (danger) or `role="status"` (warning). Optional retry. Details sit under an expandable "Technical details" with a copy button; unserialisable details never throw.                                                                                                                                                                                      |
| `Stepper` / `StepperStep` | Ordered list of collapsible steps. Status `incomplete`, `complete`, `error` is spoken in words; a one-line summary shows once complete and collapsed; `locked` blocks toggling while a run is active.                                                                                                                                                                  |

Showcase: run `pnpm dev` and open `/dev/ui` to see every primitive in every state, in both themes. The route exists only in dev builds: `import.meta.env.DEV` is read directly in `src/app/dev/dev-routes.ts` so the bundler drops the route and the showcase chunk in production (verified: a production build contains no showcase strings and no extra chunk).

## App shell (`src/app`)

- `providers.tsx`: query client, theme, toasts.
- `router.tsx`: `createAppRoutes({ slots, devRoutes })` gives `/login`, `/` (workspace), `/dev/ui` (dev only) and a not-found catch-all, under a router `errorElement` and a `HydrateFallback`.
- `layout/AppShell.tsx` (spec 3.2): 56px top bar with app name (the page `h1`), API health slot, user menu slot, theme toggle and inspector toggle; 360px setup panel; fluid map; 380px collapsible inspector. Below 1280px a polite "Best on a desktop screen" notice (dismissible) appears and the inspector becomes an overlay drawer that starts closed. Wide and narrow keep separate open states, so resizing never pops a drawer or hides a panel the user left open. A "Skip to map" link comes first.
- `useShell()` lets content in a slot call `openInspector()`, `closeInspector()`, `toggleInspector()` and read `isWide`.
- Error boundaries (`errors/`): `AppErrorBoundary` at the root (full page, reload), `PanelErrorBoundary` around each panel (retry, details), `ErrorBoundary` as the base with `resetKeys`.

### Integration points for feature tracks

All typed, none contain feature logic:

```tsx
<App
  slots={{
    login: <LoginCard />,
    user: <UserMenu />,
    setup: <SetupPanel />,
    map: <MapView />,
    inspector: <Inspector />,
  }}
/>
```

Unfilled slots show a labelled placeholder (an empty state), never a blank area. `main.tsx` currently renders `<App />` with no slots; the feature tracks pass theirs when they land.

## Deviations from the spec text

- Disabled dates after today + 16 are explained by a persistent note in the calendar (and `aria-describedby` on those days) instead of a hover tooltip, because hover tooltips are unreachable on touch and unreliable for assistive technology. The `Tooltip` primitive is still available for other hints.
- The date range picker has no typed date entry yet; the keyboard-navigable calendar and presets cover keyboard users.

## Spec 3.6 review checklist (Phase 7 exit criterion)

Reviewed against the running app (not just the design system in isolation), file by file, with
every "Gap" line an honest carry-over rather than something papered over.

| 3.6 principle                                                                       | Status                        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Minimal, quiet interface                                                            | Pass                          | One accent colour (`--accent`), neutral chrome, one elevation level (`--shadow`, used only by popover/dialog/drawer/toast/listbox). No gradients or illustrations anywhere in `src/components/ui` or the feature panels.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Visual hierarchy (map and data first)                                               | Pass                          | `AppShell`: the map is the only `flex-1` region and the only thing that must stay visible at every width (spec 3.2); the setup and inspector panels are fixed-width side columns that collapse to a drawer first.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Design tokens (spacing/radius/type/colour)                                          | Pass                          | `src/styles/tokens.css` + the table above. `tokens.test.ts` checks the dark/light pair stays in sync and contrast holds.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Data colour (colourblind-safe, no red-green, documented)                            | Pass                          | See "Data color scales" below: viridis/cividis families, a documented diverging exception (`spi`/`spei`/`rwi`/`cmi`, all zero-centred), protanopia/deuteranopia simulation with numbers recorded.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Light theme first, dark via tokens + OS + toggle                                    | Pass                          | "Themes" above. Basemap follows: `BasemapToggle`/`MapView` pick the raster/vector style and paint from `useTheme()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Basemap (OSM default + attribution, optional satellite, corner toggle)              | Pass                          | `basemap.ts`/`basemap.test.ts`: OSM attribution string on the default source, an optional satellite style gated on `VITE_MAP_STYLE_SATELLITE_URL`; `attributionControl` is asserted never disabled (`map-controller.test.ts`). `BasemapToggle` sits in the map's top-left corner (`MapView.tsx`), with the layer switcher and legend in the top-right (`MapSlot.tsx`) — both "in the map's corner" per spec, just opposite ones so they never collide.                                                                                                                                                                                     |
| WCAG 2.2 AA contrast (4.5:1 text, 3:1 UI/data)                                      | Pass, with a recorded margin  | Tokens: see "Contrast" above. Data scales: see the colour-scale table below — worst case 3.09:1 (`metric`/light), which clears 3:1 but is the number to re-check first if a palette stop ever changes.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Keyboard-complete, visible focus ring                                               | Pass                          | `:focus-visible` is styled globally (`globals.css`). Every primitive (`Button`, `Combobox`, `Tabs`, `Dialog`/`Drawer` via Radix, `DateCalendar`, `Slider`) is reachable and operable by keyboard; `a11y-ui.spec.ts`'s "every focusable element shows a visible focus ring" runs against the full `/dev/ui` showcase.                                                                                                                                                                                                                                                                                                                       |
| Landmarks and labels                                                                | Pass                          | `AppShell`: `<header>`, `<aside aria-label="Setup">`, `<main aria-label="Map">`, `<aside aria-label="Inspector">`, a "Skip to map" link. Every icon-only control (`IconButton`) requires a `label` prop at the type level.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `aria-live` for status and errors                                                   | Pass                          | Analysis running/loading (`ResultsPanel`'s `LoadingPanel`, `RunningOverlay`), the stale badge (`StaleBadge`/`ResultsPanel`), the API health indicator, and the desktop-width notice all use `role="status" aria-live="polite"`. Form field errors are associated via `aria-describedby`/`aria-invalid`, read with the field, not a separate live region (correct per WCAG: a field error is not a global status).                                                                                                                                                                                                                          |
| Respects `prefers-reduced-motion`                                                   | Pass                          | A global CSS override collapses every animation/transition to ~0 (`globals.css`). JS-driven motion that CSS cannot reach checks the media query directly: `MapView.ts` (camera moves/`flyTo`), `map-actions.ts` (`fitBounds`/pan easing), `RunningOverlay.tsx` (its own inline keyframes). Verified in a real browser: `a11y-ui.spec.ts` "reduced motion removes animations".                                                                                                                                                                                                                                                              |
| Keyboard grid navigation + "View as table"                                          | Pass                          | `ResultsPanel`'s own `ArrowUp`/`Down`/`Left`/`Right` handler moves the grid selection; `CellDetailPanel` binds `[`/`]` to previous/next cell. `TableView` is the full "View as table" alternative, with its own roving-tabindex row navigation (Up/Down/Home/End).                                                                                                                                                                                                                                                                                                                                                                         |
| Microcopy (plain, action-oriented, units everywhere)                                | Pass, one open owner question | Errors across `AnalysisErrorPanel`/`ErrorBanner` state what happened and what to do next (e.g. "You're not signed in. Sign in again to continue."). `formatMetricValue`/`formatIndex`/`formatPhysical` apply `Intl.NumberFormat` with the spec's decimal rule everywhere a metric is shown. **Gap:** `precip`/`et_actual`/`gdd` display hourly-scale units with a caveat (ADR-006) because of an unresolved backend scaling question (BACKEND_REQUESTS.md #4, PROGRESS.md Q2) — correct microcopy, but the underlying number's meaning is still an open question for the product owner, not a frontend defect.                             |
| Feedback (pressed/spinner/optimistic, skeletons, toasts only for background events) | Pass                          | Every `Button` has `hover`/`active` states and an `aria-busy`+spinner `loading` prop. `Skeleton` is used for every loading panel (`ResultsPanel`, the API health indicator, the map's `Suspense` fallback, `HistoryPanel`). The only two toasts in the app are `SessionExpiryToast` (a background session event) and the `/dev/ui` showcase's demo toast — form validation is always inline, never a toast. **Not separately measured:** "every action responds within 100 ms" has no automated timing test; it is a design constraint honoured by construction (no network call blocks a click handler) rather than a benchmarked number. |
| Keyboard shortcuts (`D`, `Esc`, `⌘/Ctrl+Enter`, `[`/`]`, `L`, `?`)                  | Pass                          | All six are live and listed in the `?` sheet (`ShortcutsDialog.tsx`). `D`/`Esc` live with `DrawControl`, `⌘/Ctrl+Enter` with `useAnalysisFlow`, `[`/`]` and arrow-key navigation with `ResultsPanel`, `L`/`?` with `WorkspaceContext` (the one owner for shortcuts with no single component).                                                                                                                                                                                                                                                                                                                                              |
| Empty, loading, error and stale states for every panel                              | Pass                          | `EmptyState` is used for: no field yet (`FieldStep`), no results yet / no cells selected (`ResultsPanel`, `FarmSummaryPanel`), an empty table (`TableView`), no advisories (`AdvisoryList`), and now no saved runs (`HistoryPanel`, Phase 7). Loading: `Skeleton` everywhere listed above. Error: `ErrorBanner`/`AnalysisErrorPanel` for every API error shape (spec 2.6). Stale: the `StaleBadge` ("Inputs changed — re-run to update"), shown only for a live result, never for a reopened saved run (which cannot go stale).                                                                                                            |

Net: every 3.6 principle is met by the running app. The two items flagged "not separately
measured" or "one open owner question" are not frontend gaps in behaviour, just things this
checklist records honestly rather than overstating: a timing budget nothing automatically asserts,
and a backend unit-scaling question (BACKEND_REQUESTS.md #4) the frontend already works around
(ADR-006) but cannot resolve on its own.

## Session history (Phase 7)

`src/features/history/`: the last 10 runs (inputs, response, timestamp), kept in IndexedDB
(`store.ts`, `createIndexedDbHistoryStore`) with an in-memory fallback used automatically when
IndexedDB is unavailable (and, incidentally, what every unit test runs against, since jsdom has no
IndexedDB — see `store.test.ts`'s own note). `use-session-history.ts` loads, trims to 10 (oldest
evicted from storage, not just hidden) and clears. `HistoryPanel.tsx` is the list UI (empty state,
loading skeleton, Reopen, Clear history); `WorkspaceContext` records each new successful run once
and can show a saved run in place of the live one (`historyView`/`openHistoryEntry`/
`closeHistoryView`), reachable through a "History" button in the inspector. The real IndexedDB
code path (not just the in-memory fallback) is exercised in `tests/e2e/history.spec.ts`, which
reloads the page between saving and reopening a run to prove it survives in real browser storage.
Local-only, as the spec requires: nothing here is sent anywhere.

## Data color scales

## Data color scales

Owner: map layer (`src/features/map/color-scales.ts`, `color-math.ts`). Tests: `color-scales.test.ts`, `color-math.test.ts`.

### Scales

| Scale       | Family                | Used for                                                                     | Domain                                                        |
| ----------- | --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `cpi`       | viridis               | the five CPI cluster scores                                                  | fixed 0..1, never clipped                                     |
| `metric`    | cividis               | raw metrics that vary by cell                                                | observed values clipped to the 2nd-98th percentile (type 7)   |
| `diverging` | blue, neutral, orange | only metrics with a meaningful midpoint: `spi`, `spei`, `rwi`, `cmi` (all 0) | clipped like `metric`, then made symmetric about the midpoint |

- No red-green pairing anywhere. Tests assert the hue of every anchor stays out of the red and green ranges.
- When the percentile clip changes any value, `ValueDomain.clipped` is true and the legend shows "clipped to the 2nd-98th percentile" with the observed min and max. `flat` is true when every cell has the same value; the legend then says so instead of drawing a gradient (farm-level weather metrics fall in this case, see API_CONTRACT D5).
- No data: a neutral grey diagonal hatch (8 px tile, 2 px stroke, transparent background so the basemap stays visible), registered as an image per theme. Light `#595959`, dark `#b0b0b0`. Colour is never the only signal: no data is a pattern, not a shade on the scale.

### Per-theme ranges

One luminance range cannot reach 3:1 against both a white-ish and a black-ish basemap, so each theme uses the part of the palette that does. Light theme takes the dark-to-mid part (viridis stops 0-6 of 16, cividis 0-7 of 16). Dark theme takes the mid-to-light part (viridis 9-16, cividis 10-16). The raster basemap is toned to match (`BASEMAP_RASTER_PAINT`: light saturation -0.4; dark brightness-max 0.25, saturation -0.5), so the reference colours below hold.

Basemap reference colours used for the contrast test: light `#ffffff #f2efe9 #bcd8b2 #aad3df` (white, OSM land, vegetation, water); dark `#000000 #404040` (black and the brightest pixel the dimmed raster produces).

### Verification

Colour-blind simulation uses the Machado, Oliveira and Fernandes (2009) matrices at severity 1.0 for protanopia and deuteranopia, applied in linear RGB. Distance is CIEDE2000. Lightness is CIELAB L\*. The tests require, for every sequential scale, theme and vision type (normal, protanopia, deuteranopia): L\* strictly increasing along the anchors and 7 samples; 6 legend classes at least dE 3 apart and 7 samples at least dE 2.3 (one just-noticeable difference) apart; and every one of 60 samples at least 3:1 against every reference colour of its theme. Diverging scales must move monotonically in lightness away from the centre, have adjacent steps at least dE 3 (7 samples) and ends at least dE 15 apart.

Measured results (vitest run, all of these assertions passing). "dE6" is the smallest adjacent difference between 6 classes, "dE7" between 7 samples, L\* is first to last anchor.

| Scale / theme       | Worst contrast | Normal dE6 / dE7 | Protanopia dE6 / dE7 | Deuteranopia dE6 / dE7 | L\* (normal)         |
| ------------------- | -------------- | ---------------- | -------------------- | ---------------------- | -------------------- |
| cpi / light         | 3.35           | 6.2 / 5.1        | 5.6 / 4.2            | 4.2 / 3.3              | 15 to 45             |
| cpi / dark          | 3.18           | 9.2 / 8.0        | 3.1 / 2.6            | 4.6 / 3.8              | 59 to 91             |
| metric / light      | 3.09           | 5.6 / 4.2        | 5.1 / 3.8            | 5.3 / 3.8              | 14 to 47             |
| metric / dark       | 3.40           | 5.0 / 4.1        | 5.3 / 4.2            | 4.6 / 3.8              | 61 to 91             |
| diverging / light   | 3.17           | 8.6 / 7.7        | 7.5 / 5.9            | 7.6 / 6.1              | 20 to 17 (centre 45) |
| diverging / dark    | 3.56           | 9.7 / 9.0        | 7.4 / 5.5            | 6.0 / 4.1              | 88 to 86             |
| no-data hatch light | 4.37           | n/a              | n/a                  | n/a                    | n/a                  |
| no-data hatch dark  | 4.78           | n/a              | n/a                  | n/a                    | n/a                  |

Reading the table: the tightest margin is `cpi / dark` under protanopia (dE6 3.1, dE7 2.6), which passes the thresholds but has little spare room. The tightest contrast is `metric / light` at 3.09:1 against its worst reference colour. Treat both as the numbers to re-check if a palette stop is ever changed.

### Limits of this verification

- Simulation covers dichromacy (protanopia, deuteranopia) only. Tritanopia and anomalous trichromacy (partial severity) are not tested.
- Contrast is measured against the reference colours listed above, not against sampled map tiles. A custom style (`VITE_MAP_STYLE_URL`) or the satellite layer is outside the guarantee; the legend swatches carry their own outline for that reason.
- Distances are computed on the palette, not on rendered GL output, so GL gamma handling is not verified.
