# UI5 Kit Graph — Comparison Report

Generated: 2026-04-10T23:16:52.916Z
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

| Metric | A-baseline | B-cold | B-warm |
|---|---|---|---|
| Turns                  | 2 | 6 | 7 |
| Input tokens           | 8857 | 36043 | 46598 |
| Cache creation tokens  | 0 | 0 | 0 |
| Cache read tokens      | 0 | 28908 | 33726 |
| Output tokens          | 4274 | 4169 | 4750 |
| **Billed input (in + cache_creation×1.25 + cache_read×0.1)** | 8857 | 38934 | 49971 |
| Duration (s)           | 54.0 | 60.8 | 62.9 |
| Files written          | 2 | 2 | 2 |

### Tool calls

| Tool | A-baseline | B-cold | B-warm |
|---|---|---|---|
| write_files | 1 | 1 | 1 |
| query_kit | 0 | 14 | 14 |

## Hallucination analysis

Counts of UI5 component usages where the component, attribute, or event does not exist in the graph.

| Metric | A-baseline | B-cold | B-warm |
|---|---|---|---|
| Total `<ui5-*>` usages | 10 | 14 | 14 |
| Distinct components used | 10 | 11 | 11 |
| **Unknown components** | 0 | 0 | 0 |
| **Unknown properties** | 2 | 0 | 0 |
| **Unknown events** | 1 | 1 | 1 |

### A-baseline — details

**Unknown properties:**
- `<ui5-dynamic-page>` `show-header-content` in `src/app/project-dashboard-page.component.ts`
- `<ui5-dynamic-page>` `background-design` in `src/app/project-dashboard-page.component.ts`

**Unknown events:**
- `<ui5-side-navigation>` `(selectionChange)` in `src/app/project-dashboard-page.component.ts`

### B-cold — details

**Unknown events:**
- `<ui5-side-navigation>` `(ui5SelectionChange)` in `src/app/project-dashboard-page.component.ts`

### B-warm — details

**Unknown events:**
- `<ui5-side-navigation>` `(ui5SelectionChange)` in `src/app/project-dashboard-page.component.ts`

## Final assistant text

### A-baseline
```
Here's a breakdown of everything generated:

---

## Files produced

### `src/app/sample-timeline.ts`
Exports the `TimelineEntry` interface and `SAMPLE_TIMELINE` array with 5 entries:

| # | Title | Icon | Timestamp |
|---|-------|------|-----------|
| 1 | Project Kick-off | `flag` | 2026-01-10 |
| 2 | Architecture Review | `building` | 2026-02-14 |
| 3 | Sprint 1 Complete | `accept` | 2026-03-28 |
| 4 | UAT Started | `person-placeholder` | 2026-05-05 |
| 5 | Go-Live Target | `rocket` | 2026-06-30 |

---

### `src/app/project-dashboard-page.component.ts`

**Key design decisions:**

| Concern | Implementation |
|---------|---------------|
| **Dark theme** | `setTheme('sap_horizon_dark')` called at module load (top-level, runs once) |
| **`ui5-dynamic-page`** | `titleArea` slot → `ui5-dynamic-page-title` with heading + subheading; `headerArea` slot → `ui5-dynamic-page-header` with 3 label/value pairs; `content` slot → FCL |
| **Status badge** | Hand-styled with `--sapIndicationColor_5_*` tokens (blue "information" semantic) |
| **Flexible Column Layout** | `layout="TwoColumnsStartExpanded"` — start column visible + mid column expanded |
| **Side Navigation** | Uses `(selectionChange)` event; selected item drives `activeItem` signal |
| **Reactive state** | Single `activeItem` signal; `illustrationName()` is a derived getter |
| **Timeline** | `@for` over `SAMPLE_TIMELINE`; all attrs bound via `[attr.*]` to avoid Angular/custom-element binding conflicts |
| **Empty states** | `ui5-illustrated-message` with `TntDashboard`, `EmptyList`, or `NoActivities` illustration names per item |
| **Change detection** | `OnPush` throughout |
| **Styling** | All colours/spacing use `--sap*` CSS custom properties from the Horizon token set |

**To wire it up** in your existing bootstrap, simply add the selector `<app-project-dashboard-page>` and import `ProjectDashboardPageComponent` into whatever host component or routes you have.
```

### B-cold
```
Both files are written. Here's a summary of what was built:

---

## `ProjectDashboardPage` — what's in the box

### `src/app/sample-timeline.ts`
Exports a typed `TimelineEntry` interface and `SAMPLE_TIMELINE` — an array of 5 chronological project milestones (Kickoff → Infrastructure → Data Migration → UAT → Go-Live), each with `titleText`, `subtitleText`, `icon`, and `name`.

---

### `src/app/project-dashboard-page.component.ts`

**Theme**: `setTheme('sap_horizon_dark')` called at module load, before any component definition.

**Layout layers:**
| Layer | Component | Key detail |
|---|---|---|
| Page shell | `ui5-dynamic-page` | `hidePinButton` not set → pin visible; fills 100 vh |
| Title | `ui5-dynamic-page-title` | `heading` slot → H2 title; `subheading` slot → subtitle text |
| Header | `ui5-dynamic-page-header` | Three `header-pair` divs with `ui5-label` + styled `<span>` values; Status is tinted `--sapInformativeColor` |
| Columns | `ui5-flexible-column-layout` | `layout="TwoColumnsMidExpanded"` — 33 % start / 67 % mid |
| Start col | `ui5-side-navigation` | 4 items (Overview/Tasks/Timeline/Team) with icons; `(ui5SelectionChange)` updates `activeNav` signal |
| Mid col — Timeline | `ui5-timeline` + `ui5-timeline-item` | Rendered when `activeNav() === 'Timeline'`; iterates `SAMPLE_TIMELINE` |
| Mid col — others | `ui5-illustrated-message` | Contextual illustration (`NoData`, `NoTasks`, `NoSearchResults`) + title per nav item |

**Styling**: all colours/spacing use `--sap*` variables (`--sapBackgroundColor`, `--sapList_Background`, `--sapTextColor`, `--sapInformativeColor`, `--sapFontSize`, etc.) so they automatically adapt to the dark theme without hardcoded hex values.
```

### B-warm
```
Both files are written. Here's a concise summary of what was built:

---

## Files generated

### `src/app/sample-timeline.ts`
Exports a `TimelineEntry` interface and `TIMELINE_ENTRIES` — 5 project milestone entries (Project Kickoff → Staging Deployment), each with `titleText`, `subtitleText`, `icon`, `timestamp`, and `name`.

### `src/app/project-dashboard-page.component.ts`
A fully standalone `ProjectDashboardPageComponent` with:

| Concern | Implementation |
|---|---|
| **Theme** | `setTheme('sap_horizon_dark')` called at module load |
| **Outer shell** | `<ui5-dynamic-page>` with `titleArea` / `headerArea` slots |
| **Title** | `<ui5-dynamic-page-title>` → `heading` slot (`ui5-title`) + `subheading` slot |
| **Header** | `<ui5-dynamic-page-header>` with Owner / Status / Due pairs; "In Progress" styled as a rounded badge using `--sapInformativeColor` |
| **Layout** | `<ui5-flexible-column-layout [layout]="'TwoColumnsMidExpanded'">` — start column ~33 %, mid column ~67 % |
| **Start column** | `<ui5-side-navigation>` with 4 items (Overview, Tasks, Timeline, Team), each bound with `[selected]` and driven by the `activeNav` signal |
| **Mid column — Timeline** | `<ui5-timeline layout="Vertical">` iterating over `TIMELINE_ENTRIES` |
| **Mid column — others** | `<ui5-illustrated-message>` with per-nav `name`, `titleText`, `subtitleText` (BeforeSearch / NoTasks / NoData) |
| **Styling** | 100 % `--sap*` CSS variables: `--sapBackgroundColor`, `--sapGroup_ContentBackground`, `--sapGroup_TitleBorderColor`, `--sapContent_LabelColor`, `--sapTextColor`, `--sapFontSize`, `--sapInformativeColor` |
```
