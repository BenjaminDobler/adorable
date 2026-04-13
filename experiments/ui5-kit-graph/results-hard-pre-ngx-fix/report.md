# UI5 Kit Graph — Comparison Report

Generated: 2026-04-10T22:17:35.270Z
Model: `claude-sonnet-4-6`

## Test prompt

```
Build me a single Angular standalone component called `ProjectDashboardPage` that uses UI5 Web Components with the SAP Horizon DARK theme.

Layout:
- The outermost container should be a `ui5-dynamic-page` with:
  - a `ui5-dynamic-page-title` showing the heading "Project Atlas Migration" and a subtitle "Q2 2026 deliverables"
  - a `ui5-dynamic-page-header` below the title containing three label+value pairs: Owner "Jane Doe", Status "In Progress", Due "2026-06-30"
- Inside the page content, render a `ui5-flexible-column-layout` in the layout mode that shows the start column and a mid-expanded middle column simultaneously:
  - START column: a `ui5-side-navigation` with 4 items — Overview, Tasks, Timeline, Team. Selecting an item updates what is shown in the mid column.
  - MID column: when "Timeline" is selected, render a `ui5-timeline` with 5 `ui5-timeline-item` entries (title, subtitle, icon, timestamp). For the other 3 items, show a `ui5-illustrated-message` empty-state placeholder with an appropriate illustration name.
- Dark theme: call `setTheme('sap_horizon_dark')` at module load. Use Horizon `--sap*` CSS variables for any additional custom styling you need (backgrounds, spacing, borders).

Output ONLY these two files:
- `src/app/project-dashboard-page.component.ts` — the standalone component with inline template and styles
- `src/app/sample-timeline.ts` — exports the 5 sample timeline entries

Do not write bootstrap, config, module, or test files. Do not call read_files — the workspace is empty.
```

## Metrics

| Metric | A-baseline | B-with-kit |
|---|---|---|
| Turns                  | 2 | 7 |
| Input tokens           | 10466 | 60921 |
| Cache creation tokens  | 0 | 0 |
| Cache read tokens      | 0 | 0 |
| Output tokens          | 4400 | 4781 |
| **Billed input (in + cache_creation×1.25 + cache_read×0.1)** | 10466 | 60921 |
| Duration (s)           | 52.7 | 65.1 |
| Files written          | 2 | 2 |

### Tool calls

| Tool | A-baseline | B-with-kit |
|---|---|---|
| write_files | 1 | 1 |
| query_kit | 0 | 13 |

## Hallucination analysis

Counts of UI5 component usages where the component, attribute, or event does not exist in the graph.

| Metric | A-baseline | B-with-kit |
|---|---|---|
| Total `<ui5-*>` usages | 13 | 12 |
| Distinct components used | 11 | 12 |
| **Unknown components** | 0 | 0 |
| **Unknown properties** | 0 | 0 |
| **Unknown events** | 0 | 0 |

### A-baseline — details

No hallucinations detected. ✓

### B-with-kit — details

No hallucinations detected. ✓

## Final assistant text

### A-baseline
```
Here's a summary of what was built:

---

## Files Created

### `src/app/sample-timeline.ts`
Exports the `TimelineEntry` interface and `SAMPLE_TIMELINE` array — 5 milestone entries covering Project Kick-off → Architecture Review → Alpha Release → Security Audit → Production Go-Live, each with `title`, `subtitle`, `icon`, and `timestamp` fields.

---

### `src/app/project-dashboard-page.component.ts`
A fully standalone `ProjectDashboardPageComponent` with:

| Concern | Detail |
|---|---|
| **Theme** | `setTheme('sap_horizon_dark')` called at module load (top-level, before the class) |
| **Dynamic Page** | `<ui5-dynamic-page>` with `ui5-dynamic-page-title` (heading + subtitle) and `ui5-dynamic-page-header` (Owner / Status / Due grid) |
| **Flexible Column Layout** | `layout="TwoColumnsMidExpanded"` — start column is narrower, mid column is expanded |
| **Side Navigation** | 4 items (Overview, Tasks, Timeline, Team) each with an icon; `selection-change` event drives `selectedNav` signal |
| **Timeline** | Rendered only when `selectedNav() === 'Timeline'`; loops over `SAMPLE_TIMELINE` with `<ui5-timeline-item>` |
| **Empty State** | All other 3 nav items render `<ui5-illustrated-message>` with appropriate illustration names (`NoData`, `NoTasks`, `NoSearchResults`) |
| **Styling** | Uses `--sapBackgroundColor`, `--sapTextColor`, `--sapContent_LabelColor`, `--sapGroup_ContentBackground`, `--sapAccentColor6`, `--sapPositiveColor`, etc. throughout — no hard-coded colours |
| **Change Detection** | `OnPush` |
| **Schema** | `CUSTOM_ELEMENTS_SCHEMA` registered so Angular doesn't complain about `ui5-*` elements |
```

### B-with-kit
```
Both files are written. Here's a concise summary of what was built:

---

## What was generated

### `src/app/sample-timeline.ts`
Exports `TimelineEntry` interface + `SAMPLE_TIMELINE_ENTRIES` — 5 milestone objects (Project Kickoff → Beta Deployment) each with `titleText`, `subtitleText`, `icon`, and `name` (timestamp).

---

### `src/app/project-dashboard-page.component.ts`

**Standalone** · **OnPush** · **Signals-based**

| Concern | Implementation |
|---|---|
| **Theme** | `setTheme('sap_horizon_dark')` called at module load (top-level, before the class) |
| **Layout** | `ui5-dynamic-page` → `titleArea` + `headerArea` slots + default content |
| **Title** | `ui5-dynamic-page-title` with `heading` (H3 title) and `subheading` slots |
| **Header** | `ui5-dynamic-page-header` with a flex grid of 3 label/value pairs; Status has a semantic badge using `--sapIndicationColor_5*` variables |
| **FCL** | `layout="TwoColumnsMidExpanded"` — start column ~33%, mid column ~67% |
| **Side nav** | `ui5-side-navigation` with 4 `ui5-side-navigation-item`s; `(selection-change)` fires `onNavSelect()` which writes to an Angular `signal<NavItem>` |
| **Timeline** | Shown when `activeNav() === 'Timeline'`; 5 `ui5-timeline-item` entries rendered with `@for` |
| **Empty states** | `ui5-illustrated-message` with illustration names `TntMission` / `NoTasks` / `NoData` per nav item, driven by a `computed()` map lookup |
| **Styling** | All colors/spacing use `--sap*` CSS variables (no hardcoded hex), so they automatically adapt to the dark theme tokens |
```
