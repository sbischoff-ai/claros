# Claros — Architecture

## Overview

Claros is a modular system with a strict separation between the file format, the emergence engine, derived state, and the editor UI.

```
story-format     Canonical file format, project conventions, state schemas,
                 StateAdapter interface, dot-path utilities
      ↑
story-state      FileStateAdapter + derived-index layer (wikilinks, backlinks, search, git)

emergence-engine Oracle/dice/macro engine; InMemoryStateAdapter for testing
      ↑ (both import story-format)
editor-core
  ├── story-state
  └── emergence-engine

apps → editor-core
```

---

## Packages

### `@claros/story-format`

Defines:

- Project folder structure and conventions
- Markdown + YAML frontmatter conventions
- Wikilink syntax
- Emergence block syntax (fenced and inline)
- Table YAML format (random-table and matrix types)

**Exports:** `parseTable`, table types, `parseStateFile`, `serializeStateFile`, `parseNoteFrontmatter`, `serializeNoteFrontmatter`, `getAtPath`, `setAtPath`, `StateAdapter`, `StateData`, `ProjectStateSnapshot`, `NoteFrontmatter`.

### `@claros/emergence-engine`

Implements:

- Dice expression parser and evaluator (all standard notation + kh/kl/pool/exploding/d100)
- Random table lookup (1D range, 2D matrix + classify)
- Expression language (jexl-based, with `and`/`or`/`not` English aliases)
- Macro YAML parser (`parseMacro`) and executor (`executeMacro`)

Imports `StateAdapter` from `@claros/story-format`. **No dependency on `@claros/story-state`.**

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

Imports `StateAdapter` from `@claros/story-format`. **No dependency on `@claros/emergence-engine`.**

### `@claros/editor-core` / `apps/*`

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

Authoritative state is file-based YAML in `state/` at the project root, tracked by git (ADR-015).

| Scope     | Lifetime                               | Path prefix       |
| --------- | -------------------------------------- | ----------------- |
| `story`   | Entire project                         | `state.story.*`   |
| `chapter` | Current chapter                        | `state.chapter.*` |
| `scene`   | Current scene (resets on scene change) | `state.scene.*`   |

Entity state (character sheets, NPC stats) lives in wiki note frontmatter under a `state:` key (ADR-017). SQLite/IndexedDB are for derived indexes only — never authoritative state.

### ID Convention

All IDs are **kebab-case**: `abandoned-temple`, `chapter-01`, `kareth`, `the-priest`. The ID equals the filename without extension (ADR-019).

### Explicit invocation context

Macros access state using explicit scene and chapter IDs, passed via `MacroInvocationContext` and available in expressions as `scene_id` and `chapter_id` (ADR-020):

```yaml
# In a macro param source:
source: "state.scenes[scene_id].mythic.chaos_factor"

# In a macro effect target:
set: state.scenes[scene_id].mythic.chaos_factor
```

There is no implicit "active scene" shorthand. The caller always provides the context.

### StateAdapter interface

Defined in `@claros/story-format`. Uses explicit methods:

```typescript
adapter.getStory(path)
adapter.setStory(path, value)
adapter.getScene(sceneId, path)
adapter.setScene(sceneId, path, value)
adapter.getChapter(chapterId, path)
adapter.setChapter(chapterId, path, value)
adapter.getAll(sceneId?, chapterId?)  // → ProjectStateSnapshot
```

---

## Dependency Constraints

- `story-format` has no internal dependencies
- `emergence-engine` imports from `story-format`; does **not** import from `story-state`
- `story-state` imports from `story-format`; does **not** import from `emergence-engine`
- `editor-core` imports from both `story-state` and `emergence-engine`
- Packages do not import from apps

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

- **Canonical files.** Markdown and state YAML are the source of truth. Databases are disposable.
- **Explicit context.** Macros name their state targets explicitly — no implicit "active scene."
- **Adapter-based state.** `StateAdapter` is the interface; implementations are swappable.
- **Moddable.** All oracle systems are YAML macro + table files. No system-specific engine code.
- **Editor independence.** Projects are usable from the editor, CLI, Obsidian, or any text editor.
- **No temporal inference.** The system makes no assumptions about narrative order. Git provides the audit trail.
