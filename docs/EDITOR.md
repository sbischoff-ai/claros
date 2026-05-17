# Claros — Editor Development Guide

This document is the primary reference for developing the editor apps (`apps/web`, `apps/desktop`) and the `@claros/editor-core` package.

For current end-user behavior, see [`EDITOR_USER_MANUAL.md`](EDITOR_USER_MANUAL.md).

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

| Component             | State             | Notes                          |
| --------------------- | ----------------- | ------------------------------ |
| `apps/web`            | Early editor host | Single-document draft editor   |
| `apps/desktop`        | Placeholder       | Tauri integration deferred     |
| `@claros/editor-core` | Early editor core | CodeMirror Markdown foundation |
| `@claros/story-state` | Empty stub        | Not available until Iter 09–10 |

The emergence engine (`@claros/emergence-engine`) is fully implemented through Iter 04 and provides a stable API. State adapter and file backend come in Iter 07.

---

## Tech Stack

### Web app (`apps/web`)

- **SvelteKit** — app framework and routing
- **CodeMirror 6** — source Markdown editing, configured as a prose writing surface
- **Yjs** — future CRDT document model; not part of the first editor slice
- **Tauri** — thin native shell only; all application logic in web app

---

### Desktop app (`apps/desktop`)

- **Tauri** — thin native shell only; all application logic lives in the web app
- The desktop app should contain no business logic; it only provides native window management and filesystem access (via Tauri commands)

### Package dependencies (planned)

When the following packages are implemented, the editor will consume them:

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
import { parseMacro, executeMacro } from "@claros/emergence-engine";
import type { MacroDefinition, MacroResult, ResolvedParams } from "@claros/emergence-engine";

// Parse a macro from YAML (typically loaded from a .yaml file in the project's modules/)
const macro: MacroDefinition = parseMacro(yamlString);

// Provide sceneId and chapterId explicitly — they propagate through invoke chains
// and are available in macro expressions as scene_id and chapter_id
const context: MacroInvocationContext = {
  sceneId: "abandoned-temple", // kebab-case scene ID
  chapterId: "chapter-01", // kebab-case chapter ID
};

const result: MacroResult = await executeMacro(
  macro,
  params, // Record<string, unknown> — resolved from user input or state
  tables, // Map<string, AnyTable> — tables the macro references
  rng // optional — injectable RNG; omit for random behavior
);

// result.output — the macro's declared output values
// result.steps  — all step results
```

### Dice rolling (Iter 01)

```typescript
import { parseDice, rollDice, defaultRNG } from "@claros/emergence-engine";
import type { RollResult } from "@claros/emergence-engine";

const expr = parseDice("2d20kh1+3");
const result: RollResult = rollDice(expr, defaultRNG);
// result.total, result.rolls, result.kept, result.modifier
// For 1d100: also result.is_double, result.double_digit
```

### Table lookup (Iter 02)

```typescript
import { lookup, matrixLookup } from "@claros/emergence-engine";
import { parseTable } from "@claros/story-format";
import type { RandomTable, MatrixTable } from "@claros/story-format";

const table = parseTable(yamlString) as RandomTable;
const result = lookup(table, rollValue, rng);
// result.matched — the row's result string
// result.row     — the full row object
```

### Error types

```typescript
import {
  MacroParseError,
  NotImplementedError,
  LookupError,
  ParseError,
} from "@claros/emergence-engine";
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

````markdown
```emergence
type: oracle
intent: "Does the priest recognise the blade?"
odds: likely
status: pending
```
````

````

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
  rolls:
    fate: 43
````

````

**The editor is responsible for rendering these blocks** — distinguishing `pending` vs `resolved`, and providing the UI to trigger resolution. The engine computes the result; the editor writes it back into the file.

### Inline invocations

Compact inline syntax (for keyboard-first flows):

```markdown
{{oracle: "Does he recognize the blade?", odds=likely}}
````

These may resolve to inline results or expand into full fenced blocks. The exact UX is still being designed (see Open Questions below).

---

## Emergence Block Lifecycle

1. **Authoring** — user inserts `{{oracle: ...}}` or a fenced block via command palette
2. **Pending** — `status: pending`; editor renders as an interactive element
3. **Resolution** — user triggers; editor calls `executeMacro()` with the scene's `MacroInvocationContext`
4. **Resolved** — result written back into the block's YAML; editor renders outcome
5. **Materialization** — user may convert the result to prose (UX open — see below)

---

## Keyboard-First UX Notes

- Vim-like modal editing is optional and must remain a first-class toggle, not the default
- Command palette (`/` or `Ctrl+P`) is the primary interaction model
- Minimal chrome — focus on the text
- The editor must feel like a prose writing tool, not a code editor: no line numbers, code gutters, minimaps, or programmer-oriented chrome in the default experience
- Markdown remains canonical, but common syntax markers should be visually quiet or hidden when the cursor is not near them
- Themeability starts with semantic CSS variables for prose, surfaces, selection, focus, Markdown markers, and future Claros widgets

---

## What Not to Touch

These packages are spec-gated. Do not modify them without a delegated spec task:

| Package                    | Why                                                            |
| -------------------------- | -------------------------------------------------------------- |
| `@claros/story-format`     | Governs the canonical file format; changes require spec review |
| `@claros/emergence-engine` | Macro/table/dice engine; governed by iteration specs           |

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
- ✅ CodeMirror Markdown editor configured as a prose writing surface
- ✅ Theme tokens and prose typography
- ✅ Browser-local single-document draft persistence
- ✅ Wikilink visual treatment (resolution deferred to Iter 09)
- ✅ Emergence block visual treatment (mock resolution later)
- ✅ Command palette scaffold
- ✅ Local filesystem adapter design (implementation waits for project/file adapters)
- ✅ Frontmatter parsing and display
- ✅ Yjs document model design
- ✅ Tauri shell setup after the writing surface stabilizes

```bash
pnpm --filter @claros/editor-core add @codemirror/state @codemirror/view @codemirror/commands @codemirror/lang-markdown @codemirror/language @codemirror/search @replit/codemirror-vim
```

CodeMirror extensions and view plugins are the right unit for:

- Wikilink rendering
- Emergence block rendering (pending and resolved states)
- Frontmatter handling (hide or render as structured header)
- Inline dice/oracle invocation syntax

Each feature should be its own extension or view plugin in `packages/editor-core/src/extensions/`.

---

## Open Design Questions

These are known open questions. Do not make decisions that implicitly resolve them without discussion:

| Question                                                                          | Status   |
| --------------------------------------------------------------------------------- | -------- |
| Emergence block materialization UX — when/how does a resolved block become prose? | Open     |
| Vim-like modal editing — detailed command set beyond the initial toggle           | Open     |
| Yjs sync backend — Hocuspocus (self-hosted), WebRTC p2p, or hosted                | Deferred |
| Inline invocation syntax (`{{...}}`) vs fenced block as primary authoring mode    | Open     |
| Command palette design and shortcut conventions beyond the initial shell          | Open     |

---

## Summary: What You Can Build Now

Safe to implement independently, parallel to the iteration plan:

- ✅ SvelteKit app structure, routing, layout
- ✅ CodeMirror Markdown editor with prose-first typography and quiet syntax markers
- ✅ Browser-local single-document draft persistence
- ✅ Wikilink rendering extension (render `[[Target]]` as a link; resolution comes later)
- ✅ Emergence block rendering extension (render fenced blocks as interactive UI; mock resolution later)
- ✅ Command palette scaffold (UI shell; commands wired up incrementally)
- ✅ Local filesystem adapter design (open/read/write project folder files later)
- ✅ Frontmatter parsing and display
- ✅ Yjs document model integration design
- ✅ Tauri shell setup and file system command bridge after the web editor surface stabilizes

Wait for these before wiring up:

- ⏳ Live macro invocation through `executeMacro` — available now from emergence-engine; just needs the project's module files to be loaded
- ⏳ Wikilink resolution — needs story-state (Iter 09)
- ⏳ Git checkpoints — needs story-state (Iter 10)
