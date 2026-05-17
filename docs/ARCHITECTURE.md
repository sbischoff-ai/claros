# Claros — Architecture

## Overview

Claros is a modular system with a strict separation between the file format, the emergence engine, derived state, and the editor UI. These concerns are independent packages that interact only through well-defined interfaces.

```
story-format          Canonical file format and project conventions
      ↑
story-state           Derived-state indexing: wikilinks, backlinks, search, git

emergence-engine      Oracle/dice/macro engine — completely independent

editor-core
  ├── story-state
  └── emergence-engine

apps/web              SvelteKit app
apps/desktop          Tauri shell (thin — no logic)
apps/cli              Command-line tools
```

The file format is the durable public standard. All other systems are implementations built around it. If the editor, engine, or state layer were replaced, the markdown project files would remain valid and complete.

---

## Packages

### `@claros/story-format`

Defines:

- Project folder structure and conventions
- Markdown + YAML frontmatter conventions
- Wikilink syntax
- Emergence block syntax (fenced and inline)
- Table YAML format (random-table and matrix types)

Has no dependencies on any other Claros package. This is the canonical layer.

**Stable exports:** `parseTable`, table types (`RandomTable`, `MatrixTable`, `AnyTable`)

### `@claros/emergence-engine`

Implements:

- Dice expression parser and evaluator (all standard notation + kh/kl/pool/exploding/d100)
- Random table lookup (1D range, 2D matrix + classify)
- Expression language (jexl-based, with `and`/`or`/`not` English aliases)
- Macro YAML parser (`parseMacro`) and executor (`executeMacro`)

Completely standalone — no dependency on any other Claros package. Accepts an injectable RNG for deterministic testing.

**Stable exports (Iter 01–04):**

- `parseDice`, `rollDice`, `defaultRNG`, `fixedRNG`
- `lookup`, `matrixLookup`, `LookupError`
- `createEvaluator`, `ExpressionEvaluator`
- `parseMacro`, `executeMacro`, `MacroParseError`, `NotImplementedError`
- All associated TypeScript types

**Planned (Iter 05–06):** macro composition, sub-macro invocation, state model, Mythic GME integration milestone

### `@claros/story-state`

Will implement:

- Project folder scanner
- Wikilink resolution and backlink tracking
- Entity indexing (SQLite on desktop, IndexedDB in browser)
- Filesystem adapters (local, eventually WebDAV)
- isomorphic-git integration (auto-commit, checkpoints, history)

**Current state:** Empty stub. Implementation begins Iter 09.

### `@claros/editor-core`

Will implement:

- TipTap/ProseMirror editor foundation
- Inline emergence UX (pending/resolved block rendering)
- Wikilink rendering extension
- Command palette
- Yjs CRDT document model

**Current state:** Empty stub. Free to develop in parallel with emergence engine iterations.

### `@claros/export`

Will implement:

- Pandoc pipeline for clean manuscript export
- Output formats: DOCX, PDF, EPUB, markdown
- Separation of prose from procedural metadata

**Current state:** Stub. Deferred.

---

## Dependency Constraints

Enforced:

- `story-format` has no internal dependencies
- `emergence-engine` has no internal dependencies
- `story-state` depends on `story-format`
- `editor-core` depends on `story-state` and `emergence-engine`
- Apps depend on packages; packages do not depend on apps

Violated by:

- Any import of `editor-core` from `emergence-engine` or `story-format`
- Any import of `story-state` from `emergence-engine`
- Any business logic in `apps/desktop` (logic goes in packages or `apps/web`)

---

## State Model

The state model has three lifetime scopes:

| Scope     | Lifetime                               | Path prefix       |
| --------- | -------------------------------------- | ----------------- |
| `story`   | Entire project                         | `state.story.*`   |
| `chapter` | Current chapter                        | `state.chapter.*` |
| `scene`   | Current scene (resets on scene change) | `state.scene.*`   |

RPG system state uses a system prefix: `state.story.mythic.*`, `state.story.ironsworn.*`, etc.

State is persisted by `story-state` (implementation Iter 09). During macro execution, state is passed in as part of the execution context (added in Iter 05).

---

## Macro System

Macros are YAML files in a project's `modules/` directory. They are the public API for all oracle/RPG behavior — no oracle logic lives in engine code.

The engine stack is three layers:

```
Layer 1  Dice expression evaluator
         "2d20kh1+5" → {rolls: [14, 7], kept: [14], total: 19}

Layer 2  Table resolver
         lookup / matrix-lookup → row result or classified cell value

Layer 3  Macro runner
         named YAML recipes composing layers 1 + 2
```

A macro can `roll`, `lookup`, `matrix-lookup`, and `invoke` other macros. It evaluates `when:` conditions to skip steps conditionally, resolves `output:` values as expressions, and declares `effects:` for state mutations.

Full macro DSL reference: see `spec-macro-dsl.md` (Nextcloud: `Projects/claros/spec-macro-dsl.md`).

---

## Technology Stack

| Concern               | Technology                                                  |
| --------------------- | ----------------------------------------------------------- |
| Language              | TypeScript (strict mode)                                    |
| Monorepo              | pnpm workspaces + Turborepo v2                              |
| Testing               | Vitest                                                      |
| Web app               | SvelteKit                                                   |
| Editor                | TipTap (ProseMirror) + Yjs                                  |
| Desktop               | Tauri (shell only)                                          |
| Persistence           | SQLite (desktop) / IndexedDB (browser) — derived state only |
| Versioning            | isomorphic-git                                              |
| Export                | Pandoc                                                      |
| Expression evaluation | jexl v2                                                     |
| YAML parsing          | js-yaml                                                     |

---

## Design Principles

**Canonical files.** Markdown files are the source of truth. Databases, indexes, and caches are always disposable. A project must be usable from any text editor.

**Adapter-based persistence.** Filesystem access is abstracted behind adapters. The same editor core works against a local filesystem (Tauri), browser filesystem API, or future sync backends.

**Moddable by design.** All oracle systems and RPG rulesets are text files (YAML macros and tables) in the project's `modules/` directory. No system-specific logic belongs in engine code.

**Editor independence.** The editor never owns the data model. Projects should be usable through the web editor, CLI tools, Obsidian, or any markdown editor without loss of data.
