# Claros — Architecture

## Overview

Claros is a modular system with a strict separation between the file format, the emergence engine, derived state, and the editor UI. These concerns are independent packages that interact only through well-defined interfaces.

```
story-format          Canonical file format, project conventions, state schemas, StateAdapter interface
      ↑
story-state           FileStateAdapter + derived-index layer (wikilinks, backlinks, search, git)

emergence-engine      Oracle/dice/macro engine — standalone; InMemoryStateAdapter for testing

editor-core
  ├── story-state
  └── emergence-engine

apps/web              SvelteKit app
apps/desktop          Tauri shell (thin — no logic)
apps/cli              Command-line tools
```

The file format is the durable public standard. All other systems are implementations built around it.

---

## Packages

### `@claros/story-format`

Defines:
- Project folder structure and conventions
- Markdown + YAML frontmatter conventions
- Wikilink syntax
- Emergence block syntax (fenced and inline)
- Table YAML format (random-table and matrix types)
- State file schemas and types (`StateData`, `StateScope`, `StateFile`, `NoteFrontmatter`)
- `StateAdapter` interface — the contract between the emergence engine and any storage backend
- Dot-path utilities for navigating nested state (`getAtPath`, `setAtPath`)

Has no dependencies on any other Claros package.

**Stable exports:** `parseTable`, table types, `parseStateFile`, `serializeStateFile`, `parseNoteFrontmatter`, `serializeNoteFrontmatter`, `getAtPath`, `setAtPath`, `StateAdapter`, and associated types.

### `@claros/emergence-engine`

Implements:
- Dice expression parser and evaluator
- Random table lookup (1D range, 2D matrix + classify)
- Expression language (jexl-based)
- Macro YAML parser and executor (with `invoke`, state param resolution, effects, hooks)
- `InMemoryStateAdapter` — for testing; implements `StateAdapter` from story-format
- `ModuleRegistry` — macro and table registry for invoke resolution and hook dispatch

Imports `StateAdapter` from `@claros/story-format`. Has no dependency on `@claros/story-state`.

**Stable exports (Iter 01–04):** dice, table, expression, and macro APIs + all types.
**Planned (Iter 06):** macro composition, `InMemoryStateAdapter`, `ModuleRegistry`, hook dispatch.

### `@claros/story-state`

Will implement:
- `FileStateAdapter` — reads/writes authoritative state YAML files; implements `StateAdapter`
- `advanceScene` — creates a new scene state file from the previous scene's state
- Entity state read/write via wiki note frontmatter
- Project folder scanner (Iter 09)
- Wikilink resolution and backlink tracking (Iter 09)
- Entity indexing — SQLite (desktop) / IndexedDB (browser) for **derived indexes only** (Iter 11)
- isomorphic-git integration (Iter 12)

**Current state:** Empty stub. FileStateAdapter implementation begins Iter 07.

### `@claros/editor-core`

Will implement:
- TipTap/ProseMirror editor foundation
- Inline emergence UX (pending/resolved block rendering)
- Wikilink rendering extension
- Command palette

**Current state:** Empty stub.

### `@claros/export`

Will implement Pandoc export pipeline. **Current state:** Stub.

---

## State Model

Authoritative state is file-based YAML in a `state/` folder at the project root, tracked by git.

```
state/
  story.yaml                  state.story.* — project-global
  chapters/<id>.yaml          state.chapter.* — per chapter
  scenes/<id>.yaml            state.scene.* — per scene snapshot
```

Entity state (character sheets, NPC stats, faction standing) lives in wiki note frontmatter under a `state:` key. The entity's file slug is its ID.

SQLite and IndexedDB are for **derived indexes only** (wikilinks, backlinks, full-text search) — never for authoritative state.

State scopes (story/chapter/scene) are organisational conventions. The system enforces no lifecycle rules and makes no assumptions about narrative order. See `decisions.md` ADR-015–018.

---

## Dependency Constraints

```
story-format          (no internal deps)
      ↑
story-state
      ↑
emergence-engine → story-format
      ↑
editor-core → story-state + emergence-engine
      ↑
apps → editor-core
```

- `story-format` has no internal dependencies
- `emergence-engine` depends on `story-format`; does **not** depend on `story-state`
- `story-state` depends on `story-format`; does **not** depend on `emergence-engine`
- `editor-core` depends on both `story-state` and `emergence-engine`
- Apps depend on packages; packages do not depend on apps

---

## Technology Stack

| Concern | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Monorepo | pnpm workspaces + Turborepo v2 |
| Testing | Vitest |
| Web app | SvelteKit |
| Editor | TipTap (ProseMirror) + Yjs |
| Desktop | Tauri (shell only) |
| Authoritative state | YAML files in `state/` (git-tracked) |
| Derived indexes | SQLite (desktop) / IndexedDB (browser) |
| Versioning | isomorphic-git |
| Export | Pandoc |
| Expression evaluation | jexl v2 |
| YAML parsing | js-yaml |

---

## Design Principles

**Canonical files.** Markdown and state YAML files are the source of truth. Databases and indexes are always disposable and rebuildable.

**Adapter-based state.** The macro executor reads/writes state through `StateAdapter`. The in-memory adapter (emergence-engine) is for testing; the file adapter (story-state) is for real projects. The editor wires the correct adapter at runtime.

**Moddable by design.** All oracle systems are YAML macro + table files in `modules/`. No system-specific logic in engine code.

**Editor independence.** The editor never owns the data model. Projects are usable via the web editor, CLI, Obsidian, or any text editor.

**No temporal inference.** The system does not infer narrative order from file structure or commit history. The author controls state consistency. Git provides the audit trail for retcons.
