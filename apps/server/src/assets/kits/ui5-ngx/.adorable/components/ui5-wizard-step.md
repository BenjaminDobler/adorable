# WizardStep

**Type:** Component
**Selector:** `<ui5-wizard-step>`
**Import:** `import { WizardStepComponent } from '@ui5/webcomponents-ngx/fiori/wizard-step';`
**Export As:** `ui5WizardStep`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-wizard-step [titleText]="..."></ui5-wizard-step>
```

## Description
A component that represents a logical step as part of the ui5-wizard. It is meant to aggregate arbitrary HTML elements that form the content of a single step. - Each wizard step has arbitrary content. - Each wizard step might have texts - defined by the titleText and subtitleText properties. - Each wizard step might have an icon - defined by the icon property. - Each wizard step might display a number in place of the icon, when it's missing. The ui5-wizard-step component should be used only as slot of the ui5-wizard component and should not be used standalone.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `titleText` | `string | undefined` | `undefined` | Defines the titleText of the step. **Note:** The text is displayed in the ui5-wizard navigation header. |
| `subtitleText` | `string | undefined` | `undefined` | Defines the subtitleText of the step. **Note:** the text is displayed in the ui5-wizard navigation header. |
| `icon` | `string | undefined` | `undefined` | Defines the icon of the step. **Note:** The icon is displayed in the ui5-wizard navigation header. The SAP-icons font pr |
| `disabled` | `boolean` | `false` | Defines if the step is disabled. When disabled the step is displayed, but the user can't select the step by clicking or  |
| `selected` | `boolean` | `false` | Defines the step's selected state - the step that is currently active. **Note:** Step can't be selected and disabled at  |
| `branching` | `boolean` | `false` | When branching is enabled a dashed line would be displayed after the step, meant to indicate that the next step is not y |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the step content. |
