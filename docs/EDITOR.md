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

---

## Current State

| Component | State | Notes |
|---|---|---|
| `apps/web` | SvelteKit scaffold | Routes exist, no editor yet |
| `apps/desktop` | Placeholder | Tauri integration deferred |
| `@claros/editor-core` | Empty stub | Ready to build |
| `@claros/story-state` | Empty stub | Not available until Iter 07 |

The emergence engine (`@claros/emergence-engine`) is fully implemented through Iter 04 and provides a stable API. State adapter and file backend come in Iter 07.

---

## Tech Stack

- **SvelteKit** — app framework and routing
- **TipTap** (ProseMirror) + **Yjs** — editor and CRDT document model
- **Tauri** — thin native shell only; all application logic in web app

---

## Package Dependencies (planned)

```
apps/web
  └── @claros/editor-core
        ├── @claros/story-state     (Iter 07 — FileStateAdapter; Iter 09 — project index)
        └── @claros/emergence-engine  (✅ stable through Iter 04)
```

Do not import `@claros/story-state` until Iter 07 delivers `FileStateAdapter`.

---

## ID Convention

All entity and file IDs are **kebab-case**: lowercase, hyphen-delimited, no spaces or uppercase. The ID equals the filename without the extension.

```
abandoned-temple  →  state/scenes/abandoned-temple.yaml
chapter-01        →  state/chapters/chapter-01.yaml
kareth            →  notes/characters/kareth.md
the-priest        →  notes/characters/the-priest.md
```

This convention is mandatory and applies everywhere: filenames, macro expressions, API calls, UI labels.

---

## Stable API: `@claros/emergence-engine`

### Macro execution (Iter 04 + Iter 06 when ready)

```typescript
import { parseMacro, executeMacro } from "@claros/emergence-engine"
import type { MacroDefinition, MacroResult, MacroInvocationContext } from "@claros/emergence-engine"
import type { StateAdapter } from "@claros/story-format"

const macro: MacroDefinition = parseMacro(yamlString)

// Provide sceneId and chapterId explicitly — they propagate through invoke chains
// and are available in macro expressions as scene_id and chapter_id
const context: MacroInvocationContext = {
  sceneId: "abandoned-temple",   // kebab-case scene ID
  chapterId: "chapter-01"        // kebab-case chapter ID
}

const result: MacroResult = await executeMacro(
  macro,
  params,          // Record<string, unknown>
  registry,        // ModuleRegistry
  stateAdapter,    // StateAdapter (FileStateAdapter from story-state, or InMemoryStateAdapter)
  context,         // MacroInvocationContext
  rng,             // optional
  userPrompt       // optional — wires to command palette / prompt UI
)
// result.output — the macro's declared output values
// result.steps  — all step results
```

### Dice rolling (Iter 01)

```typescript
import { parseDice, rollDice, defaultRNG } from "@claros/emergence-engine"
const result = rollDice(parseDice("2d20kh1+3"), defaultRNG)
// result.total, result.rolls, result.kept, result.modifier
// For 1d100: also result.is_double, result.double_digit
```

### Error types

```typescript
import { MacroParseError, NotImplementedError, LookupError, ParseError, MissingParamError } from "@claros/emergence-engine"
```

---

## State Access in Macros

Macros access state using explicit IDs. **There is no implicit "active scene" shorthand.**

```yaml
# Scene state — explicit scene ID via context variable
params:
  chaos:
    type: int
    source: "state.scenes[scene_id].mythic.chaos_factor"

# Story state — project-global, no ID needed
params:
  thread_count:
    type: int
    source: "state.story.mythic.threads.length"

# Effects write back to scene state
effects:
  - set: state.scenes[scene_id].mythic.chaos_factor
    value: "state.scenes[scene_id].mythic.chaos_factor - 1"
    when: "params.pcs_in_control and state.scenes[scene_id].mythic.chaos_factor > 1"
```

`scene_id` and `chapter_id` are context variables set by the caller of `executeMacro` and propagated automatically through all `invoke` chains.

The `StateAdapter` interface (from `@claros/story-format`) uses explicit methods:
```typescript
adapter.getScene("abandoned-temple", "mythic.chaos_factor")  // → 5
adapter.setScene("abandoned-temple", "mythic.chaos_factor", 4)
adapter.getStory("mythic.threads")
adapter.setStory("mythic.threads", [...])
```

---

## File Format Conventions

### Project folder structure

```
project/
  manuscript/
    chapter-01/
      abandoned-temple.md    prose; frontmatter = title, type
  notes/
    characters/
      kareth.md              entity note with state: in frontmatter
    factions/
  state/
    story.yaml               state.story.* — project-global
    chapters/
      chapter-01.yaml        state.chapters["chapter-01"].*
    scenes/
      abandoned-temple.yaml  state.scenes["abandoned-temple"].*
  modules/
    mythic/
      fate-question.yaml     macro YAML
      fate-chart.yaml        table YAML
  assets/
  .claros/
    index/                   derived SQLite/IndexedDB indexes (gitignored)
```

### Entity frontmatter with state

```yaml
---
type: character
aliases: [the northern mercenary]
state:
  hp: 12
  max_hp: 15
  armor: 3
  inventory:
    - iron sword
---

# Kareth

Prose...
```

### Wikilinks

```markdown
[[Kareth]]
[[Kareth|the northern mercenary]]
```

### Emergence blocks (pending)

```markdown
```emergence
type: oracle
intent: "Does the priest recognise the blade?"
odds: likely
status: pending
```
```

### Emergence blocks (resolved)

```markdown
```emergence
type: oracle
intent: "Does the priest recognise the blade?"
odds: likely
status: resolved
result:
  answer: yes
  exceptional: false
```
```

---

## Emergence Block Lifecycle

1. **Authoring** — user inserts `{{oracle: ...}}` or a fenced block via command palette
2. **Pending** — `status: pending`; editor renders as an interactive element
3. **Resolution** — user triggers; editor calls `executeMacro()` with the scene's `MacroInvocationContext`
4. **Resolved** — result written back into the block's YAML; editor renders outcome
5. **Materialization** — user may convert the result to prose (UX open — see below)

---

## Keyboard-First UX Notes

- Vim-like modal editing is planned but not yet specced — do not implement yet; do not make it hard to add later
- Command palette (`/` or `Ctrl+P`) is the primary interaction model
- Minimal chrome — focus on the text

---

## What Not to Touch

| Package | Why |
|---|---|
| `@claros/story-format` | Governs canonical file format and state schemas |
| `@claros/emergence-engine` | Macro/table/dice engine; governed by iteration specs |

---

## Dependency Rules

```
story-format  (no internal deps)
      ↑
story-state → story-format

emergence-engine → story-format

editor-core → story-state + emergence-engine
apps/web → editor-core
```

---

## What You Can Build Now

- ✅ SvelteKit app structure, routing, layout
- ✅ TipTap editor with basic prose editing
- ✅ Wikilink rendering extension (resolution deferred to Iter 09)
- ✅ Emergence block rendering extension (mock resolution for now)
- ✅ Command palette scaffold
- ✅ Local filesystem adapter (open/read/write files)
- ✅ Frontmatter parsing and display
- ✅ Yjs document model
- ✅ Tauri shell setup

Wait for these:
- ⏳ Live macro invocation with real state — needs Iter 07 (FileStateAdapter)
- ⏳ Wikilink resolution — needs Iter 09 (project index)
- ⏳ Git checkpoints — needs Iter 12

---

## Open Design Questions

| Question | Status |
|---|---|
| Emergence block materialization UX | Open |
| Vim-like modal editing | Not yet designed |
| Yjs sync backend (Hocuspocus vs WebRTC vs hosted) | Deferred |
| Inline `{{...}}` vs fenced block as primary authoring mode | Open |
| Command palette design and shortcut conventions | Not yet designed |
