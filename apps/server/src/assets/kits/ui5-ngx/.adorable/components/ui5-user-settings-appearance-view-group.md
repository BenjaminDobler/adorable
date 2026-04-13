# UserSettingsAppearanceViewGroup

**Type:** Component
**Selector:** `<ui5-user-settings-appearance-view-group>`
**Import:** `import { UserSettingsAppearanceViewGroupComponent } from '@ui5/webcomponents-ngx/fiori/user-settings-appearance-view-group';`
**Export As:** `ui5UserSettingsAppearanceViewGroup`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-user-settings-appearance-view-group [headerText]="..." (ui5MoveOver)="onMoveOver($event)"></ui5-user-settings-appearance-view-group>
```

## Description
The ui5-user-settings-appearance-view-group is a special list item group used to group appearance view items. This is the item to use inside a ui5-user-settings-appearance-view. import "@ui5/webcomponents-fiori/dist/UserSettingsAppearanceViewGroup.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `headerText` | `string | undefined` | `undefined` | Defines the header text of the <code>ui5-li-group</code>. |
| `headerAccessibleName` | `string | undefined` | `undefined` | Defines the accessible name of the header. |
| `wrappingType` | `WrappingType` | `"None"` | Defines if the text of the component should wrap when it's too long. When set to "Normal", the content (title, descripti |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5MoveOver)` | ~~`(move-over)`~~ | Fired when a movable list item is moved over a potential drop target during a dragging operation. If the new position is |
| `(ui5Move)` | ~~`(move)`~~ | Fired when a movable list item is dropped onto a drop target. **Note:** move event is fired only if there was a precedin |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the items of the <code>ui5-user-settings-appearance-view-group</code>. |
| `header` | Defines the header of the component. **Note:** Using this slot, the default header text of group and the value of headerText property will be overwrit |

## CSS Parts
| Name | Description |
|------|-------------|
| `header` | Used to style the header item of the group |
| `title` | Used to style the title of the group header |
