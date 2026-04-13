# GroupItem

**Type:** Component
**Selector:** `<ui5-group-item>`
**Import:** `import { GroupItemComponent } from '@ui5/webcomponents-ngx/fiori/group-item';`
**Export As:** `ui5GroupItem`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-group-item [text]="..."></ui5-group-item>
```

## Description
The ui5-group-item component defines the grouping criteria for data in ui5-view-settings-dialog. It represents a single group option that users can select to organize data into logical groups. The ui5-group-item is used within the ui5-view-settings-dialog to provide grouping options. Each group item represents a column or field by which data can be grouped. import "@ui5/webcomponents-fiori/dist/GroupItem.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | Defines the text of the group item. |
| `selected` | `boolean` | `false` | Defines if the group item is selected. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.
