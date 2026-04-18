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

## Custom Providers

The `providers/adorable-provider.js` wraps Adorable's actual context builder + LLM call so evals test the real prompt pipeline, not just a raw API call.
