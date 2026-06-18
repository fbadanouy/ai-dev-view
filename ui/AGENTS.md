# AGENTS.md — `ui/` (frontend conventions)

> Scope: everything under `ui/`. Read this before adding or changing a component.
> The root [AGENTS.md](../AGENTS.md) and [docs/DATA-CONTRACT.md](../docs/DATA-CONTRACT.md)
> still apply (only real data).

## The golden rule: reuse before you write

This UI is a small set of **generic, reusable** components. Before writing markup or
logic inline in a page, check whether a primitive, helper, or hook already does it. If you
copy-paste a block across two pages, that's the signal to extract it instead. Drift here is
the #1 thing we fight — every fetch, loading state, color, and date format has **one** home.

**Before adding code, ask:**
1. Is there a primitive in `components/ui/` for this UI? (catalog below)
2. Am I fetching? → use `lib/api.js` (`getJson`/`postJson`) + `FetchController`, never `fetch('http://localhost:8765…')`.
3. Loading / error / empty UI? → `lib/async-view.js`, never hand-rolled spinner/error markup.
4. A provider color or badge? → `lib/providers.js` (the single source) / `<provider-badge>`.
5. A date or size? → `lib/format.js`.
6. Am I about to hardcode a color hex, a host URL, or a px size that should scale? (stop)

## Layout

- `components/<feature>/<feature>-page.js` — one page per nav tab.
- `components/ui/` — generic presentational primitives (no fetching, no business logic).
- `components/layout/` — `app-shell` (routing + header), `app-nav`, `master-detail`.
- `hooks/` — reactive controllers (data loading): `FetchController` (generic) + entity controllers.
- `lib/` — pure modules: `api.js`, `async-view.js`, `providers.js`, `format.js`, `file-health.js`.

## Single sources (do not duplicate)

| Concern | The one place | Don't |
|---|---|---|
| Backend host + JSON fetch | `lib/api.js` — `API_BASE`, `getJson(path)`, `postJson(path, body)` | hardcode `http://localhost:8765`; write your own `getJson` |
| List-page fetch lifecycle | `hooks/use-fetch.js` — `new FetchController(this, '/path')` → `{data, loading, error}` | re-implement `connectedCallback` + try/catch + loading flags |
| Loading / error / empty UI | `lib/async-view.js` — `asyncView({loading, error, empty}, () => html`…`)` | paste `<sl-spinner>` / "Could not reach server.py" blocks |
| Provider color / badge | `lib/providers.js` — `provider(name)` → `{text, badge, color, …}`; `<provider-badge provider=…>` | a local `PROVIDER_COLORS` map or inline hex/classes |
| Chart palette | `components/ui/time-chart.js` — `CHART_COLORS` (provider hexes come from the registry) | a second hex map in a page |
| Dates / sizes | `lib/format.js` — `fmtDate`, `timeAgo`, `fmtDuration`, `fmtBytes`, `fmtTokens` | inline `new Date().toLocaleDateString()` |

## Primitives catalog (`components/ui/`)

`stat-card`, `stat-bar` (labelled metrics) · `mini-bars` (sparkline) · `time-chart`
(Chart.js wrapper) · `session-mini-row` (compact session row: title + spark + resume) ·
`resume-chip` (copy CLI resume cmd) · `search-bar` (filter input; emits `search`) ·
`provider-badge` · `message-text`, `tool-breakdown-bar`. Layout: `master-detail`.
Reach for these; extend one rather than fork it.

## Lit conventions & gotchas (these have bitten us)

- **Light DOM everywhere.** Every component does `createRenderRoot() { return this }` so the
  CDN Tailwind classes apply. **Consequence:** `<slot>` does **not** project (no shadow root).
  Shared markup that wraps caller content must be a **render-helper function** (that's why
  `asyncView` is a function, not a `<async-view>` element), not a slotted component.
- **Custom attributes need explicit mapping.** Lit reflects a `camelCase` property to an
  all-lowercase attribute (`listWidth` → `listwidth`), **not** `list-width`. If a caller
  uses a dashed attribute, declare it: `listWidth: { type: String, attribute: 'list-width' }`.
  (A missing mapping silently used a default for every page once — hard to spot.)
- **`rem`-based sizing; root font-size is the global scale.** `index.html` sets
  `html { font-size: 150% }` and the whole app scales because Tailwind/Shoelace are `rem`.
  Express layout offsets in **`rem`**, not `px`, so they track the scale
  (e.g. `master-detail` height = `calc(100vh - 7.5rem)`, list widths in `rem`). Raw `px`
  (chart label font, a few heights) will *not* scale — use sparingly and knowingly.
- **No build step.** Everything is ESM via CDN (Lit, Tailwind Play, Shoelace, Chart.js) with
  relative imports. `<sl-*>` components auto-register via the Shoelace autoloader.

## Verifying a UI change without the running app

Mount the component in a throwaway `ui/_x.html` (import the module, set props), then headless
Chrome `--dump-dom` (optionally inject a script that writes measurements into a marker div).
Grep the dumped DOM for expected content / element counts / "0 stuck spinners". Delete the
harness after. This catches render breakage and layout/scale issues without a screenshot.
