export const ANGULAR_KNOWLEDGE_BASE = `
# Angular 21 Expert Knowledge Base

## Core Concepts
- **Standalone Components:** All components must use \x60standalone: true\x60. Do not use NgModules.
- **Signals:** Use Signals for all state management. Avoid \x60Zone.js\x60 reliance where possible.
  - State: \x60count = signal(0)\x60
  - Computed: \x60double = computed(() => this.count() * 2)\x60
  - Effects: \x60effect(() => console.log(this.count()))\x60
- **Control Flow:** Use the new block syntax:
  - \x60@if (cond) { ... } @else { ... }\x60
  - \x60@for (item of items; track item.id) { ... }\x60
  - \x60@switch (val) { @case (1) { ... } }\x60

## Styling
- Use **CSS Variables** for theming.
- Prefer **Host Binding** via \x60:host\x60 selector for component layout.
- Use \x60encapsulation: ViewEncapsulation.Emulated\x60 (default).

## Routing
- Use \x60loadComponent\x60 for lazy loading routes.
- Use \x60inject(Router)\x60 instead of constructor injection.

## HTTP
- Use \x60inject(HttpClient)\x60.
- Use \x60toSignal\x60 from \x60@angular/core/rxjs-interop\x60 to convert Observables to Signals.

## Forms
- Use \x60FormsModule\x60 for template-driven forms (simple).
- Use \x60ReactiveFormsModule\x60 for complex logic.

## Best Practices
- **Strict Typing:** Always define interfaces.
- **Separation of Concerns:** Move logic to Services (\x60@Injectable({providedIn: 'root'})\x60).
- **Inputs/Outputs:** Use Signal Inputs \x60input.required<string>()\x60 and \x60output<void>()\x60.
- **Injection:** Prefer \x60inject(Service)\x60 over constructor arguments.
`;
