# TimelineItem

**Type:** Component
**Selector:** `<ui5-timeline-item>`
**Import:** `import { TimelineItemComponent } from '@ui5/webcomponents-ngx/fiori/timeline-item';`
**Export As:** `ui5TimelineItem`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-timeline-item [icon]="..." (ui5NameClick)="onNameClick($event)"></ui5-timeline-item>
```

## Description
An entry posted on the timeline.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `icon` | `string | undefined` | `undefined` | Defines the icon to be displayed as graphical element within the ui5-timeline-item. SAP-icons font provides numerous opt |
| `name` | `string | undefined` | `undefined` | Defines the name of the item, displayed before the title-text. |
| `nameClickable` | `boolean` | `false` | Defines if the name is clickable. |
| `titleText` | `string | undefined` | `undefined` | Defines the title text of the component. |
| `subtitleText` | `string | undefined` | `undefined` | Defines the subtitle text of the component. |
| `state` | `ValueState` | `"None"` | Defines the state of the icon displayed in the ui5-timeline-item. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5NameClick)` | ~~`(name-click)`~~ | Fired when the item name is pressed either with a click/tap or by using the Enter or Space key. **Note:** The event will |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the content of the ui5-timeline-item. |
