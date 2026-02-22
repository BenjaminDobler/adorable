export const ANGULAR_KNOWLEDGE_BASE = `
# Angular 21 Expert Knowledge Base

## Core Concepts
- **Standalone Components:** All components must use \`standalone: true\`. Do not use NgModules.
- **Signals:** Use Signals for all state management. Avoid \`Zone.js\` reliance where possible.
  - State: \`count = signal(0)\`
  - Computed: \`double = computed(() => this.count() * 2)\`
  - Effects: \`effect(() => console.log(this.count()))\`
- **Control Flow:** Use the new block syntax:
  - \`@if (cond) { ... } @else { ... }\`
  - \`@for (item of items; track item.id) { ... }\`
  - \`@switch (val) { @case (1) { ... } }\`

## Styling
- Use **CSS Variables** for theming.
- Prefer **Host Binding** via \`:host\` selector for component layout.
- Use \`encapsulation: ViewEncapsulation.Emulated\` (default).

## Routing
- Use \`loadComponent\` for lazy loading routes.
- Use \`inject(Router)\` instead of constructor injection.

## Dependency Injection (CRITICAL)
- **ALWAYS use \`inject()\` — NEVER use constructor injection.**
- \`inject()\` must be used for ALL services, Router, ActivatedRoute, HttpClient, etc.
- Constructor injection causes \`TS2729: Property used before initialization\` when combined with signal field initializers.
\`\`\`typescript
// CORRECT — inject() works with signal field initializers
export class MyComponent {
  private router = inject(Router);
  private myService = inject(MyService);
  items = this.myService.getItems(); // Works — inject() runs before field init
}

// WRONG — constructor injection breaks signal field initializers
export class MyComponent {
  constructor(private myService: MyService) {}
  items = this.myService.getItems(); // TS2729: 'myService' used before initialization
}
\`\`\`

## HTTP
- Use \`inject(HttpClient)\`.
- Use \`toSignal\` from \`@angular/core/rxjs-interop\` to convert Observables to Signals.

## Forms
- Use \`FormsModule\` for template-driven forms (simple).
- Use \`ReactiveFormsModule\` for complex logic.

## Best Practices
- **Strict Typing:** Always define interfaces and type aliases. Establish type names in the model file FIRST, then use those exact names consistently across all files that import them.
- **Separation of Concerns:** Move logic to Services (\`@Injectable({providedIn: 'root'})\`).
- **Inputs/Outputs:** Use Signal Inputs \`input.required<string>()\` and \`output<void>()\`.
- **Injection:** ALWAYS use \`inject(Service)\` — NEVER use constructor arguments.
`;
