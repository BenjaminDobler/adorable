# TimelineGroupItem

**Type:** Component
**Selector:** `<ui5-timeline-group-item>`
**Import:** `import { TimelineGroupItemComponent } from '@ui5/webcomponents-ngx/fiori/timeline-group-item';`
**Export As:** `ui5TimelineGroupItem`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-timeline-group-item [groupName]="..." (ui5Toggle)="onToggle($event)"></ui5-timeline-group-item>
```

## Description
An entry posted on the timeline. It is intented to represent a group of <ui5-timeline-item>s. **Note**: Please do not use empty groups in order to preserve the intended design.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `groupName` | `string | undefined` | `undefined` | Defines the text of the button that expands and collapses the group. |
| `collapsed` | `boolean` | `false` | Determines if the group is collapsed or expanded. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Toggle)` | ~~`(toggle)`~~ | Fired when the group item is expanded or collapsed. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Determines the content of the ui5-timeline-group-item. |
