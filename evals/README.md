# Adorable Prompt Evals

Evaluation suite for Adorable's AI prompts and context injection using [Promptfoo](https://github.com/promptfoo/promptfoo).

## Setup

```bash
npx promptfoo@latest init  # only needed once
```

## Running Evals

```bash
# Run all evals
npx promptfoo eval -c evals/promptfooconfig.yaml

# View results in web UI
npx promptfoo view

# Run a specific test suite
npx promptfoo eval -c evals/promptfooconfig.yaml --filter-pattern "angular-conventions"

# Compare two prompt versions
npx promptfoo eval -c evals/compare-prompts.yaml
```

## Test Suites

- **angular-conventions** — Does the AI use standalone components, signals, inject()?
- **restricted-files** — Does it avoid modifying package.json, angular.json, runtime scripts?
- **kit-usage** — Does it read component docs before using kit components?
- **figma-workflow** — Does it follow the design-to-code workflow?
- **efficiency** — Does it batch tool calls and minimize turns?
- **claude-code-context** — Does the CLAUDE.md contain all necessary context?

## Adding Test Cases

Add new test cases to `promptfooconfig.yaml` under the `tests` section. Each test has:
- `vars` — input variables (prompt, project state, etc.)
- `assert` — assertions on the output (contains, not-contains, llm-rubric, javascript)

## Benchmarks — Provider & Kit Comparison

The `benchmarks/` directory contains a runner for comparing AI providers and kits on standardized prompts.

### Quick Start

```bash
# Run all non-Figma prompts against Anthropic
node evals/benchmarks/run-benchmark.mjs --providers anthropic

# Compare Anthropic vs Claude Code
node evals/benchmarks/run-benchmark.mjs --providers anthropic,claude-code

# Run specific prompts
node evals/benchmarks/run-benchmark.mjs --providers anthropic --prompts simple-component,dashboard-layout

# Run with a specific kit
node evals/benchmarks/run-benchmark.mjs --providers anthropic --kit my-kit-id

# Run 3 times for statistical significance
node evals/benchmarks/run-benchmark.mjs --providers anthropic,claude-code --runs 3

# Compare two result files
node evals/benchmarks/compare-results.mjs evals/benchmarks/results/
```

### Metrics Collected

| Metric | Description |
|---|---|
| Duration | Total wall-clock time |
| Input/Output Tokens | Token counts from the API |
| Cost | Dollar cost (or "subscription" for Claude Code) |
| Tool Calls | Number of tool invocations |
| File Writes | Number of files created/modified |
| Error Rate | Percentage of runs with errors |

### Test Prompts

See `benchmarks/test-prompts.json` for the full list. Categories:
- **basic** — Simple component creation
- **feature** — CRUD, forms, data tables
- **layout** — Dashboard, landing page, responsive
- **figma** — Design-to-code (requires Figma connection)

### Adding Prompts

Add entries to `test-prompts.json`:
```json
{
  "id": "my-test",
  "name": "My Test",
  "category": "feature",
  "prompt": "Create a ...",
  "expectedOutcome": "Description of what good looks like"
}
```

## Custom Providers

The `providers/adorable-provider.js` wraps Adorable's actual context builder + LLM call so evals test the real prompt pipeline, not just a raw API call.
