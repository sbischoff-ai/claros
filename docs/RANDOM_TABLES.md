# Random Tables, Matrix Tables, Dice, and Expressions

This document describes the current dice/table/expression formats implemented in `@claros/emergence-engine` and `@claros/story-format`.

## Dice Expressions

Claros supports standard dice notation such as:

- `1d20`
- `2d20kh1`
- `2d20kl1`
- `4d6kh3`
- `5d6>=4`
- `1d6!`
- `1d100`
- `2d6+3`

A dice roll returns structured data, not just a number.

Typical `RollResult` fields include:

- `total`
- `rolls`
- `kept`
- `modifier`

### `1d100` derived fields

Percentile rolls expose two derived convenience fields used by macro logic:

- `is_double`
- `double_digit`

This supports patterns like Mythic random-event checks without requiring authors to inspect raw percentile digit pairs themselves.

## Expression Language

Macro conditions, step inputs, effect values, and output expressions are evaluated against a context.

Common context roots:

- `params.*`
- `steps.*`
- `state.*`
- `value` inside matrix `cell-format.classify` rules

The expression evaluator interface is intentionally small:

```ts
interface ExpressionEvaluator {
  evaluate(expression: string, context: Record<string, unknown>): unknown;
  evaluateBool(expression: string, context: Record<string, unknown>): boolean;
}
```

### Expression usage examples

```yaml
when: "steps.fate-roll.is_double and steps.fate-roll.double_digit <= params.chaos"
```

```yaml
value: "state.scenes[scene_id].mythic.chaos_factor - 1"
```

```yaml
result: "steps.outcome.classified"
```

Current expression support includes:

- arithmetic
- comparison
- boolean logic (`and`, `or`, `not`, plus symbolic forms)
- member/path access
- ternary expressions (`condition ? a : b`)
- membership tests via `in`

## Random Table Format

A 1D random table has `type: random-table` and range-based rows.

```yaml
id: osr.reaction
type: random-table
dice: 2d6
rows:
  - range: [2, 2]
    result: "Hostile"
  - range: [3, 5]
    result: "Unfriendly"
  - range: [6, 8]
    result: "Uncertain"
  - range: [9, 11]
    result: "Friendly"
  - range: [12, 12]
    result: "Enthusiastic"
```

Current schema:

- `id: string`
- `type: "random-table"`
- `dice: string`
- `rows: Array<{ range: [number, number], result: string }>`

### Lookup behavior

A macro `lookup` step can either:

- provide a `roll` expression explicitly, or
- omit `roll` and let the engine auto-roll using the table's declared `dice`

## Matrix Table Format

A 2D matrix table has row and column keys and optional `cell-format` classification rules.

```yaml
id: mythic.fate-chart
type: matrix
row-key: odds
column-key: chaos
cell-format:
  fields: [ey, sy, en]
  classify:
    exceptional-yes: "value <= ey"
    yes: "value <= sy"
    exceptional-no: "value >= en"
    _default: no
rows:
  - key: likely
    columns:
      1: [0, 25, 86]
      2: [1, 30, 87]
```

Current schema:

- `id: string`
- `type: "matrix"`
- `row-key: string`
- `column-key: string`
- optional `cell-format`
- `rows: Array<{ key: string, columns: Record<string | number, number[]> }>`

### `cell-format`

`cell-format` describes how numeric cell tuples should be interpreted.

Current fields:

- `fields`: positional names for the cell tuple
- `classify`: mapping of label -> expression

Classification is evaluated in order until a rule matches. `_default` acts as the fallback.

## Dynamic Weighted Arrays

The emergence engine also supports lookup from plain weighted arrays in state for dynamic/adventure-list style data.

This is runtime behavior, not a YAML table file format.

Typical entry shape:

```yaml
- label: Kareth
  weight: 2
  entity: notes/characters/kareth.md
  active: true
```

## Deferred

Not current stable guarantees:

- richer typed schemas for table result payloads beyond current string/matrix forms
- advanced table authoring UX in the editor
- module dependency version pinning for deterministic replay

## Source Planning Docs

This repo-local reference was synthesized from Iter 01, Iter 02, Iter 03, the macro DSL planning doc, and current package source.
