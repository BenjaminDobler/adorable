# IllustratedMessage

**Type:** Component
**Selector:** `<ui5-illustrated-message>`
**Import:** `import { IllustratedMessageComponent } from '@ui5/webcomponents-ngx/fiori/illustrated-message';`
**Export As:** `ui5IllustratedMessage`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-illustrated-message [name]="..."></ui5-illustrated-message>
```

## Description
An IllustratedMessage is a recommended combination of a solution-oriented message, an engaging illustration, and conversational tone to better communicate an empty or a success state than just show a message alone. Each illustration has default internationalised title and subtitle texts. Also they can be managed with titleText and subtitleText properties. To display the desired illustration, use the name property, where you can find the list of all available illustrations. **Note:** By default the “BeforeSearch” illustration is loaded. To use other illustrations, make sure you import them in a

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `name` | `string` | `"BeforeSearch"` | Defines the illustration name that will be displayed in the component. Example: name='BeforeSearch', name='UnableToUploa |
| `design` | `IllustrationMessageDesign` | `"Auto"` | Determines which illustration breakpoint variant is used. As IllustratedMessage adapts itself around the Illustration, t |
| `subtitleText` | `string | undefined` | `undefined` | Defines the subtitle of the component. **Note:** Using this property, the default subtitle text of illustration will be  |
| `titleText` | `string | undefined` | `undefined` | Defines the title of the component. **Note:** Using this property, the default title text of illustration will be overwr |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the component. |
| `decorative` | `boolean` | `false` | Defines whether the illustration is decorative. When set to true, the attributes role="presentation" and aria-hidden="tr |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the component actions. **Note:** Not displayed when the design property is set to Base. |
| `subtitle` | Defines the subtitle of the component. **Note:** Using this slot, the default subtitle text of illustration and the value of subtitleText property wil |
| `title` | Defines the title of the component. **Note:** Using this slot, the default title text of illustration and the value of title property will be overwrit |

## CSS Parts
| Name | Description |
|------|-------------|
| `subtitle` | Used to style the subtitle wrapper of the ui5-illustrated-message |
