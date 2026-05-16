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

Canonical file format, project conventions, and all state-related type definitions.

**Exports:** `parseTable`, table types, `parseStateFile`, `serializeStateFile`, `parseNoteFrontmatter`, `serializeNoteFrontmatter`, `getAtPath`, `setAtPath`, `StateAdapter`, `StateData`, `ProjectStateSnapshot`, `NoteFrontmatter`.

### `@claros/emergence-engine`

Dice, tables, expressions, macro parser and executor, `InMemoryStateAdapter`, `ModuleRegistry`, hook dispatch.

Imports `StateAdapter` from `@claros/story-format`. **No dependency on `@claros/story-state`.**

**Stable (Iter 01–04):** dice, table, expression, macro APIs.
**Iter 06:** macro composition, `InMemoryStateAdapter`, `ModuleRegistry`, `MacroInvocationContext`, `HookDispatcher`.

### `@claros/story-state`

`FileStateAdapter` (Iter 07), project index / wikilinks / backlinks (Iter 09–11), git integration (Iter 12).

Imports `StateAdapter` from `@claros/story-format`. **No dependency on `@claros/emergence-engine`.**

### `@claros/editor-core` / `apps/*`

Editor UI and applications. Depends on both `story-state` and `emergence-engine`.

---

## State Model

Authoritative state is file-based YAML in `state/` at the project root, tracked by git (ADR-015).

```
state/
  story.yaml                   state.story.* — project-global
  chapters/<id>.yaml           state.chapters["<id>"].* — per-chapter
  scenes/<id>.yaml             state.scenes["<id>"].* — per-scene snapshot
```

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

| Concern | Technology |
|---|---|
| Language | TypeScript (strict) |
| Monorepo | pnpm workspaces + Turborepo v2 |
| Testing | Vitest |
| Web app | SvelteKit |
| Editor | TipTap (ProseMirror) + Yjs |
| Desktop | Tauri (shell only) |
| Authoritative state | YAML files in `state/` (git-tracked) |
| Derived indexes | SQLite (desktop) / IndexedDB (browser) |
| Versioning | isomorphic-git |
| Expression evaluation | jexl v2 |
| YAML parsing | js-yaml |

---

## Design Principles

- **Canonical files.** Markdown and state YAML are the source of truth. Databases are disposable.
- **Explicit context.** Macros name their state targets explicitly — no implicit "active scene."
- **Adapter-based state.** `StateAdapter` is the interface; implementations are swappable.
- **Moddable.** All oracle systems are YAML macro + table files. No system-specific engine code.
- **Editor independence.** Projects are usable from the editor, CLI, Obsidian, or any text editor.
- **No temporal inference.** The system makes no assumptions about narrative order. Git provides the audit trail.
