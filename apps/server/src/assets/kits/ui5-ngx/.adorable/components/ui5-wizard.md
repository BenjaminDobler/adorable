# Wizard

**Type:** Component
**Selector:** `<ui5-wizard>`
**Import:** `import { WizardComponent } from '@ui5/webcomponents-ngx/fiori/wizard';`
**Export As:** `ui5Wizard`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-wizard [contentLayout]="..." (ui5StepChange)="onStepChange($event)"></ui5-wizard>
```

## Description
The ui5-wizard helps users to complete a complex task by dividing it into sections and guiding them through it. It has two main areas - a navigation area at the top showing the step sequence and a content area below it. The top most area of the ui5-wizard is occupied by the navigation area. It shows the sequence of steps, where the recommended number of steps is between 3 and 8 steps. - Steps can have different visual representations - numbers or icons. - Steps might have labels for better readability - titleText and subTitleText. - Steps are defined by using the ui5-wizard-step as slotted ele

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `contentLayout` | `WizardContentLayout` | `"MultipleSteps"` | Defines how the content of the ui5-wizard would be visualized. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5StepChange)` | ~~`(step-change)`~~ | Fired when the step is changed by user interaction - either with scrolling, or by clicking on the steps within the compo |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the steps. **Note:** Use the available ui5-wizard-step component. |

## CSS Parts
| Name | Description |
|------|-------------|
| `navigator` | Used to style the progress navigator of the ui5-wizard. |
| `step-content` | Used to style a ui5-wizard-step container. |
