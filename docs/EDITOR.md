# Claros — Editor Development Guide

This document is the primary reference for developing the editor apps (`apps/web`, `apps/desktop`) and the `@claros/editor-core` package.

---

## Scope and Philosophy

The editor's job is rendering and interaction — not data ownership.

**The editor does:**
- Display and edit prose (manuscript files)
- Render wikilinks, frontmatter, and emergence blocks inline
- Trigger oracle/macro invocations when the user resolves an emergence block
- Surface the results of macro execution back into the prose
- Provide keyboard-driven workflows for common operations

**The editor does not:**
- Own the canonical data model (markdown files are canonical)
- Implement oracle logic, dice rolling, or macro resolution (that's `emergence-engine`)
- Own the wikilink index or backlinks (that's `story-state`)
- Define the file format (that's `story-format`)

Think of the editor as a thin shell: it reads files, calls into packages for computation, and writes files back.

---

## Current State

| Component | State | Notes |
|---|---|---|
| `apps/web` | SvelteKit scaffold | Routes exist, no editor yet |
| `apps/desktop` | Placeholder | Tauri integration deferred |
| `@claros/editor-core` | Empty stub | Ready to build |
| `@claros/story-state` | Empty stub | Not available until Iter 09–10 |

The emergence engine (`@claros/emergence-engine`) is fully implemented through Iter 04 and provides a stable API the editor can eventually call. Story-state is not yet implemented — use mocks or local state for wikilink/index features during early editor development.

---

## Tech Stack

### Web app (`apps/web`)
- **SvelteKit** — app framework and routing
- **TipTap** (or ProseMirror directly) — rich text editor foundation
- **Yjs** — CRDT document model for offline-first and future collaboration

TipTap is the preferred editor framework because it wraps ProseMirror in a composable extension API. If a feature requires ProseMirror primitives directly, reach through TipTap's APIs — do not duplicate the document model.

### Desktop app (`apps/desktop`)
- **Tauri** — thin native shell only; all application logic lives in the web app
- The desktop app should contain no business logic; it only provides native window management and filesystem access (via Tauri commands)

### Package dependencies (planned)
When the following packages are implemented, the editor will consume them:

```
apps/web
  └── @claros/editor-core
        ├── @claros/story-state    (Iter 09 — not yet available)
        └── @claros/emergence-engine  (✅ available now)
```

**Do not import `@claros/story-state` yet** — it is an empty stub. Use local component state or mock data for wikilink resolution and indexing features until Iter 09 delivers the real implementation.

**You can import `@claros/emergence-engine` now** — its API is stable.

---

## Stable API: `@claros/emergence-engine`

These exports are implemented and stable. The editor can use them directly when wiring up macro invocations.

### Macro execution (Iter 04)

```typescript
import { parseMacro, executeMacro } from "@claros/emergence-engine"
import type { MacroDefinition, MacroResult, ResolvedParams } from "@claros/emergence-engine"

// Parse a macro from YAML (typically loaded from a .yaml file in the project's modules/)
const macro: MacroDefinition = parseMacro(yamlString)

// Execute it
const result: MacroResult = await executeMacro(
  macro,
  params,          // Record<string, unknown> — resolved from user input or state
  tables,          // Map<string, AnyTable> — tables the macro references
  rng              // optional — injectable RNG; omit for random behavior
)

// result.output — the macro's declared output values
// result.steps  — all step results (for debugging/display)
```

### Dice rolling (Iter 01)

```typescript
import { parseDice, rollDice, defaultRNG } from "@claros/emergence-engine"
import type { RollResult } from "@claros/emergence-engine"

const expr = parseDice("2d20kh1+3")
const result: RollResult = rollDice(expr, defaultRNG)
// result.total, result.rolls, result.kept, result.modifier
// For 1d100: also result.is_double, result.double_digit
```

### Table lookup (Iter 02)

```typescript
import { lookup, matrixLookup } from "@claros/emergence-engine"
import { parseTable } from "@claros/story-format"
import type { RandomTable, MatrixTable } from "@claros/story-format"

const table = parseTable(yamlString) as RandomTable
const result = lookup(table, rollValue, rng)
// result.matched — the row's result string
// result.row     — the full row object
```

### Error types

```typescript
import { MacroParseError, NotImplementedError, LookupError, ParseError } from "@claros/emergence-engine"
```

---

## File Format Conventions

The editor must read and write files that conform to the story-format conventions. These are the rules:

### Project folder structure

```
project/
  manuscript/
    001-chapter.md
    002-chapter.md

  notes/
    characters/
      kareth.md
    places/
    factions/

  modules/
    mythic/
      fate-question.yaml    # macro YAML files
      fate-chart.yaml       # table YAML files

  assets/

  .claros/
    state/                  # derived state — never canonical
```

### Frontmatter

Entity notes use YAML frontmatter:

```markdown
---
type: character
aliases:
  - the northern mercenary
---

# Kareth

Prose about the character...
```

The editor should read `type` and `aliases` from frontmatter. The prose below the frontmatter block is always canonical.

### Wikilinks

Standard Obsidian-compatible syntax:

```markdown
[[Kareth]]
[[Kareth|the northern mercenary]]
```

The editor should render these as navigable links. Resolution (what file a wikilink points to) will come from `story-state` in Iter 09. For now, treat unresolved wikilinks as plain links.

### Emergence blocks

Fenced emergence blocks represent pending or resolved oracle interactions:

```markdown
```emergence
type: oracle
intent: "Does the priest recognize the blade?"
mode: yes_no
odds: likely
status: pending
```
```

Once resolved, the block gains a `result` section:

```markdown
```emergence
type: oracle
intent: "Does the priest recognize the blade?"
mode: yes_no
odds: likely
status: resolved
result:
  answer: yes
  exceptional: false
  rolls:
    fate: 43
```
```

**The editor is responsible for rendering these blocks** — distinguishing `pending` vs `resolved`, and providing the UI to trigger resolution. The engine computes the result; the editor writes it back into the file.

### Inline invocations

Compact inline syntax (for keyboard-first flows):

```markdown
{{oracle: "Does he recognize the blade?", odds=likely}}
```

These may resolve to inline results or expand into full fenced blocks. The exact UX is still being designed (see Open Questions below).

---

## Emergence Block Lifecycle

The planned lifecycle for an emergence block:

1. **Authoring** — user types `{{oracle: ...}}` inline or inserts a fenced block via command palette
2. **Pending** — block has `status: pending`; editor renders it as an interactive element
3. **Resolution** — user triggers resolution (keyboard shortcut or click); editor calls `executeMacro()` with the appropriate macro and params
4. **Resolved** — result is written back into the block's YAML (`status: resolved`, `result: ...`); editor renders the outcome inline
5. **Materialization** — optionally, the user can "materialize" the result as prose (editor suggests a narrative sentence; user accepts/edits/rejects)

The materialization step (step 5) is an open UX question — see below.

---

## Keyboard-First UX Notes

Claros is intended to feel like a modern terminal editor adapted for prose: fast, keyboard-driven, command-palette-centric.

- A vim-like modal editing mode is a planned feature, but the UX spec has not been written yet — do not implement it yet, but do not design the editor in a way that makes it hard to add later (avoid mouse-only affordances as primary interactions)
- A command palette (`/` or `Ctrl+P`) is the primary way to insert and invoke emergence blocks
- The editor should feel minimal — minimal chrome, focus on the text

---

## What Not to Touch

These packages are spec-gated. Do not modify them without a delegated spec task:

| Package | Why |
|---|---|
| `@claros/story-format` | Governs the canonical file format; changes require spec review |
| `@claros/emergence-engine` | Macro/table/dice engine; governed by iteration specs |

If you need a capability from these packages that doesn't exist yet, flag it as a requirement rather than adding it directly.

---

## Dependency Rules

The editor dependency graph has a strict direction:

```
story-format          (no deps — canonical layer)
      ↑
story-state           (indexes story-format files)

emergence-engine      (no internal deps — standalone engine)

editor-core
  ├── story-state
  └── emergence-engine

apps/web
  └── editor-core
```

- `editor-core` and `apps/web` can import from `emergence-engine` and `story-state`
- `editor-core` must never import from `apps/web`
- `emergence-engine` must never import from `story-state` or `editor-core`
- `story-format` must never import from any other package in this repo

---

## Adding TipTap

When setting up TipTap in `packages/editor-core`:

```bash
pnpm --filter @claros/editor-core add @tiptap/core @tiptap/starter-kit
pnpm --filter @claros/editor-core add yjs y-prosemirror
```

TipTap extensions are the right unit for:
- Wikilink rendering
- Emergence block rendering (pending and resolved states)
- Frontmatter handling (hide or render as structured header)
- Inline dice/oracle invocation syntax

Each feature should be its own TipTap `Node` or `Mark` extension in `packages/editor-core/src/extensions/`.

---

## Open Design Questions

These are known open questions. Do not make decisions that implicitly resolve them without discussion:

| Question | Status |
|---|---|
| Emergence block materialization UX — when/how does a resolved block become prose? | Open |
| Vim-like modal editing — modal vs non-modal as default, command set | Not yet designed |
| Yjs sync backend — Hocuspocus (self-hosted), WebRTC p2p, or hosted | Deferred |
| Inline invocation syntax (`{{...}}`) vs fenced block as primary authoring mode | Open |
| Command palette design and shortcut conventions | Not yet designed |

---

## Summary: What You Can Build Now

Safe to implement independently, parallel to the iteration plan:

- ✅ SvelteKit app structure, routing, layout
- ✅ TipTap editor with basic prose editing (bold, italic, headings, lists)
- ✅ Wikilink rendering extension (render `[[Target]]` as a link; resolution comes later)
- ✅ Emergence block rendering extension (render fenced blocks as interactive UI; mock resolution for now)
- ✅ Command palette scaffold (UI shell; commands wired up incrementally)
- ✅ Local filesystem adapter (open/read/write project folder files)
- ✅ Frontmatter parsing and display
- ✅ Yjs document model integration (even without a sync backend)
- ✅ Tauri shell setup and file system command bridge

Wait for these before wiring up:
- ⏳ Live macro invocation through `executeMacro` — available now from emergence-engine; just needs the project's module files to be loaded
- ⏳ Wikilink resolution — needs story-state (Iter 09)
- ⏳ Git checkpoints — needs story-state (Iter 10)
