# Adorable — Internal Pitch Presentation

**Audience:** Engineering leadership
**Duration:** ~50 minutes + 10 min Q&A
**Goal:** Pitch Adorable as an internal AI app builder tailored to our Angular microfrontend stack

---

## 1. The Opportunity (3 min)

- AI app builders (Lovable, Bolt, v0) are changing how software gets prototyped
- We already use Lovable — it's fast and impressive for quick demos
- But: Lovable generates React apps. Our stack is Angular microfrontends.
- Every prototype needs a full rebuild to match our production architecture
- What if we had an AI builder that speaks our language — Angular, our patterns, our APIs?
- I built a working prototype to explore exactly this.

**Key slide:** Side-by-side: Lovable output (React) vs Adorable output (Angular with our patterns)

---

## 2. Live Demo — "See It In Action" (12 min)

Lead with the demo before any architecture talk. Let the tool speak for itself.

### Demo script:
1. **Dashboard** — Show project list, create a new project
2. **Prompt** — Type something relevant: "Create an internal dashboard showing team KPIs with a data table, filters, and a chart"
3. **Watch generation** — Real-time streaming of code generation, show the AI creating Angular components
4. **Live preview** — The app runs and updates as code is generated (HMR)
5. **Iterate** — "Add a date range filter" / "Make the sidebar collapsible" — show conversational refinement
6. **Visual editor** — Click an element in the preview, modify it directly
7. **Figma import** — Bring in a Figma design, browse layers, attach to chat
8. **Code quality** — Open file explorer, show the generated code: real Angular 21 (signals, standalone components, dependency injection)
9. **GitHub push** — One-click push to repository

**Talking point during demo:** "This is not a mockup generator. It's running a real Angular dev server with HMR, producing real TypeScript code."

---

## 3. Technical Deep Dive — How It Works (15 min)

Show the engineering behind the tool. Go layer by layer.

### a) Agentic AI Loop (5 min)
- **LLM providers:** Claude (Anthropic) and Gemini (Google) — swappable
- **Multi-turn tool-use loop:** AI receives a prompt, generates code using tools, inspects results, iterates (up to 10 turns)
- **Available tools:**
  - `write_file`, `edit_file`, `read_file` — file manipulation
  - `run_command` — execute npm build, inspect errors
  - `glob`, `grep` — search the codebase
  - `activate_skill` — load domain-specific knowledge on demand
- **Agent mode:** AI runs `npm build`, reads compiler errors, fixes them autonomously — iterative self-correction
- **Angular knowledge base:** Comprehensive prompt with Angular 21 patterns (signals, control flow, standalone components) injected into every generation

### b) Container Architecture (5 min)
Three runtime modes with a smart routing engine:

| Mode | Technology | Use case |
|------|-----------|----------|
| **Browser** | WebContainer (WASM) | Zero-setup, works anywhere, full Node.js in browser |
| **Docker** | Docker container (node:20) | Production-grade, file mounting, dev server proxy, file watcher |
| **Desktop** | Electron + native Node.js | Fastest, runs on bare metal, no Docker needed |

- All three run the actual Angular CLI dev server with Hot Module Reloading
- Docker mode: files mounted to host, chokidar file watcher syncs changes back to UI
- Preview via iframe with injected scripts for console capture and visual inspection

### c) Extensibility & Customization (5 min)
- **Skills system:** SKILL.md files extend AI knowledge
  - Company design system as a skill
  - Internal API specs as context
  - Coding conventions and patterns
  - Installable from GitHub repos
- **Figma integration:** Import designs, browse layers, select individual elements, attach to chat for context-aware generation
- **Visual editor:** Element fingerprinting maps live DOM nodes back to source code locations — click to select, modify in place
- **Backend adapter system** (designed): pluggable backends — Supabase, Express+Prisma, Pocketbase. Each adapter provides knowledge base + tools + base files + container config

---

## 4. Why This Matters for Us (7 min)

Frame around our specific situation:

### The problem with generic tools
- Generic AI builders generate generic code in generic frameworks
- Prototypes look great in demos but none of the code survives contact with production
- Design-to-code gap: designers create in Figma, developers rebuild from scratch

### What Adorable enables
- **Same framework as production:** Angular 21 — signals, standalone components, proper DI
- **Teachable via skills:** Load our component library, design tokens, API contracts
- **Closer to production:** Generated code follows our patterns, uses our abstractions
- **Figma to Angular:** Designers' work directly informs code generation
- **Progressive fidelity:** Start as prototype, incrementally refine toward production quality

### Concrete scenario
"A PM describes a new feature. Instead of waiting for a dev sprint, they use Adorable to generate a working Angular prototype that uses our component library and talks to our internal APIs via skills. The prototype goes through a review, and because it's already in our framework with our patterns, significant portions of the code can be promoted to a microfrontend."

---

## 5. Roadmap — Where This Goes (5 min)

### Near-term
- **Company skills pack** — Pre-built skills for our design system, API patterns, MFE conventions
- **Fullstack adapters** — Connect to our internal backends and databases
- **MFE scaffold** — Generate microfrontends that plug into the shell application

### Medium-term
- **Team features** — Shared projects, template library, skill sharing across teams
- **CI/CD integration** — Generated code flows through our pipeline
- **Design system integration** — Company component library pre-loaded

### Long-term
- **Deployment adapters** — One-click deploy to internal infrastructure
- **Multi-framework support** — Adapter-based framework switching (if needed)
- **Adapter marketplace** — Teams build and share custom adapters

---

## 6. Effort & Feasibility (3 min)

Address the "is this realistic?" question:

- **Core is already built and working** — the demo proves it
- **Built with AI assistance** — the tool helps build itself (meta-productivity)
- **Customization = content, not code:** Teaching the AI our patterns means writing skills (markdown files with instructions), not rewriting the platform
- **Incremental value:** Useful today for prototyping. Each company-specific skill added makes it more valuable.
- **Low infrastructure cost:** Runs on a single Docker host or developer laptops. Only cost is AI API calls.

**The ask:** Dedicated time allocation to:
1. Deploy internally (Docker on internal infra)
2. Build company skills pack (design system, API patterns)
3. Pilot with one team for prototyping workflows

---

## 7. Q&A (10 min)

### Anticipated questions and answers:

**"How much does it cost?"**
→ Self-hosted, no license fees. Only cost is LLM API usage (Claude/Gemini). Roughly $0.10-0.50 per generation depending on complexity.

**"What about code quality?"**
→ The Angular knowledge base enforces modern patterns. Agent mode validates by actually building the code. Skills can enforce company conventions.

**"Can non-developers use it?"**
→ Yes, the chat interface requires no coding knowledge. But the generated code is real and editable by developers.

**"How does it compare to GitHub Copilot / Cursor?"**
→ Different tool, different purpose. Copilot assists individual developers writing code. Adorable generates entire applications from descriptions. Complementary, not competing.

**"What if the AI generates bad code?"**
→ Agent mode catches compilation errors. The code is always visible and editable. Skills guide the AI toward correct patterns. It's a starting point, not a final product.

**"Is the code proprietary / does it leave our network?"**
→ The generated code stays local (Docker/Desktop). Only the prompts go to the LLM API. Can be configured with on-premise LLMs in the future if needed.

---

## Presentation Tips

- **Demo is everything.** Practice it. Have a backup recording in case of technical issues.
- **Use a real-ish scenario** for the demo that the audience recognizes from their work.
- **Show the code** during the demo — engineers want to see the output quality.
- **Have the Figma import ready** — it's a strong visual moment.
- **Keep architecture slides visual** — diagrams over bullet points.
- **End with a concrete ask** — what you need from them to move forward.
