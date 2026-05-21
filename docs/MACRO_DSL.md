# Macro DSL

This document describes the current macro DSL implemented in
`@claros/emergence-engine` and the way document-context execution is exposed
through `@claros/story-state`.

## Overview

A macro is a YAML-defined procedure composed from:

- typed parameters
- computation steps
- optional conditions
- explicit state effects
- structured output
- optional writer-facing display template

Macros are registered through a module manifest and executed through the
emergence engine or the higher-level story-state workspace API.

## Macro File Shape

Current macro definitions parse to this conceptual structure:

```yaml
id: mythic.fate-question
name: "Mythic Fate Question"
description: "Ask a Yes/No question using the Mythic Fate Chart"
hooks: [on_scene_start]

params:
  odds:
    type: enum
    source: user
    values: [unlikely, fifty-fifty, likely]
    prompt: "What are the odds?"

steps:
  - id: fate-roll
    roll: 1d100

  - id: outcome
    matrix-lookup:
      table: mythic.fate-chart
      row: "params.odds"
      column: "params.chaos"
      classify: "steps.fate-roll.total"

effects:
  - set: state.scenes[scene_id].mythic.chaos_factor
    value: "state.scenes[scene_id].mythic.chaos_factor - 1"
    when: "params.pcs_in_control"

output:
  result: "steps.outcome.classified"

display:
  format: markdown
  title: "Mythic Fate Question"
  template: |
    **Question:** {{params.intent}}
    **Roll:** `1d100 -> {{steps.fate-roll.total}}`

    **{{output.result | title}}.**
```

## Top-Level Fields

Current parsed macro fields:

- `id: string`
- `name: string`
- optional `description: string`
- optional `hooks: string[]`
- `params: Record<string, ParamDefinition>`
- `steps: MacroStep[]`
- `effects: EffectDefinition[]`
- `output: MacroOutputDefinition`
- optional `display: MacroDisplayDefinition`

## Parameters

### Parameter types

Current supported parameter types:

- `string`
- `int`
- `float`
- `bool`
- `enum`
- `dice-expr`
- `ref`

### Parameter fields

A parameter definition may include:

- `type`
- `required`
- `source`
- `fallback`
- `prompt`
- `default`
- `range` for numeric params
- `values` for enum params

Example:

```yaml
chaos:
  type: int
  range: [1, 9]
  source: state.scene.mythic.chaos_factor
  fallback: user
  prompt: "Current Chaos Factor (1-9)"
```

### Parameter sources

Current source forms in the type system:

- `user`
- `state.story.<path>`
- `state.chapter.<path>`
- `state.scene.<path>`
- `state.character.active.<path>`
- `state.character.<id>.<path>`
- `literal:<value>`

`fallback: user` means prompting may happen when state resolution does not provide a value.

## Step Types

Each step has:

- `id`
- optional `when`
- exactly one step body

Current step bodies:

### `roll`

```yaml
- id: check
  roll: 2d20kh1+3
```

Evaluates a dice expression and stores the structured roll result under `steps.<id>`.

### `lookup`

```yaml
- id: focus
  lookup:
    table: mythic.event-focus
    roll: "steps.fate-roll.total"
```

Looks up a `random-table` entry. If `roll` is omitted, the engine auto-rolls using the table's declared `dice`.

### `matrix-lookup`

```yaml
- id: outcome
  matrix-lookup:
    table: mythic.fate-chart
    row: "params.odds"
    column: "params.chaos"
    classify: "steps.fate-roll.total"
```

Looks up a matrix cell using row and column expressions, then optionally classifies a value against the cell's `cell-format` rules.

### `invoke`

```yaml
- id: random-event
  invoke: mythic.random-event-check
  with:
    chaos: "params.chaos"
```

Invokes another macro and stores the nested result under `steps.<id>`.

Nested macro effects are propagated into the parent `MacroResult.effects` in
current code.

## Conditions

Both steps and effects may use `when` expressions.

If `when` evaluates false:

- the step is skipped, or
- the effect is not applied

Example:

```yaml
when: "steps.fate-roll.is_double and steps.fate-roll.double_digit <= params.chaos"
```

## Effects

Effects are explicit state writes performed after step evaluation.

Current effect fields:

- `set: string`
- `value: string`
- optional `when: string`

Example:

```yaml
effects:
  - set: state.scenes[scene_id].mythic.chaos_factor
    value: "state.scenes[scene_id].mythic.chaos_factor + 1"
    when: "not params.pcs_in_control"
```

Document-context execution records applied effects in the macro run ledger when available.

## Output

`output` is a nested object whose leaves are expressions.

Example:

```yaml
output:
  result: "steps.outcome.classified"
  random_event_triggered: "steps.random-event != null"
  rolls:
    fate: "steps.fate-roll.total"
```

At runtime this becomes a structured output object in `MacroResult.output` and in the run ledger entry.

## Display Templates

`display` is an optional writer-facing Markdown template used by document-context execution.

```yaml
display:
  format: markdown
  title: "Mythic Fate Question"
  template: |
    **Question:** {{params.intent}}
    **Odds:** {{params.odds | title}}

    **Roll:** `1d100 -> {{steps.fate-roll.total}}`

    **{{output.result | title}}.**

    {{#if output.random_event}}
    Random event: {{output.random_event.focus}}
    {{/if}}
```

Macro authors write the body only. `@claros/story-state` owns the final `[!claros]`
blockquote wrapper and trailing `[claros-run: <id>]` marker.

Template rendering is provided by `@claros/emergence-engine` through
`renderMacroDisplay(...)`. Placeholders use `{{expression}}` with the same expression
evaluator over:

- `params`
- `steps`
- `output`
- `context.document`
- `context.sceneId`
- `context.chapterId`
- `run.id`
- `macro`

Display templates may use `{{#if expression}}...{{/if}}` for optional sections.
Supported filters are `title` and `json`. Templates containing `[!claros]` or
`[claros-run:` are rejected so modules cannot double-wrap ADR-027 markers.

If a macro has no display template, `@claros/emergence-engine` uses a generic
fallback display body.

## Hooks

Macros may register `hooks`, for example `on_scene_start`.

The registry can list macros by hook through `getMacrosByHook(hookName)`.

The hook dispatcher exists in `@claros/emergence-engine`, but editor-facing orchestration of those hooks is still broader product work.

## Module Integration

Macros are loaded through module directories referenced by `manifest.modules`.

A module manifest lists macro and table files:

```yaml
id: mythic-gme-2e
name: "Mythic GME 2e"
version: "0.1.0"
macros:
  - macros/fate-question.yaml
  - macros/scene-setup.yaml
tables:
  - tables/fate-chart.yaml
```

`loadModuleFromDirectory()` parses those files and registers them in a `ModuleRegistry`.

## Document-Context Execution

Editor and CLI consumers should normally go through `@claros/story-state` rather than calling `executeMacro()` directly.

Current workspace flow:

1. `openProject(root)` builds a `ClarosProject`
2. `project.executeMacroInDocument(...)` resolves the document path and derives scene/chapter context when applicable
3. `story-state` loads modules into a registry
4. `executeMacro()` runs against the registry, RNG, prompt callback, and `FileStateAdapter`
5. `story-state` appends a run ledger entry in `state/runs/emergence.yaml`
6. if `insertAt` was provided, `story-state` inserts a `[!claros]` block into the target document through the project file reader/writer abstraction
7. the in-memory project index is refreshed

### Insert behavior

Macro execution does **not** mutate the document unless `insertAt` is explicitly provided.

## Macro Run Ledger Implications

Document-context macro execution captures provenance including:

- run ID
- timestamp
- macro ID
- document path
- scene/chapter IDs when derived
- resolved params
- rolls
- structured output
- display block
- applied effects when available

Display and provenance are intentionally split:

- the manuscript gets an editable `[!claros]` block
- the ledger keeps the technical run record

## Current Workspace Types

Relevant editor-facing types re-exported from `@claros/story-state` include:

- `UserPromptFn`
- `DocumentInsertionPoint`
- `MacroRunFilter`
- `ExecuteMacroInDocumentOptions`
- `ExecuteMacroInDocumentResult`
- `MacroRunLedgerEntry`

## Deferred

Not current stable guarantees:

- deterministic replay across module upgrades
- module lockfiles or source hashing in ledger entries
- persistent pending invocation syntax in manuscripts
- full editor hook orchestration UX
- richer module packaging/distribution tooling

## Source Planning Docs

This repo-local reference was synthesized from the macro DSL planning doc, the ADR-027 amendment, Iter 04, Iter 06, Iter 10, Iter 12, and current package source.
