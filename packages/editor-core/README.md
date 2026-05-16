# @claros/editor-core

TipTap/ProseMirror editor package for Claros.

**Current state:** Empty stub — ready to build. This package is not spec-gated and can be developed freely in parallel with the emergence engine iteration plan.

---

## Purpose

`editor-core` is the reusable editor component library. It provides:

- The TipTap editor instance and configuration
- ProseMirror extensions for Claros-specific markup (wikilinks, emergence blocks, frontmatter)
- The Yjs document model for offline-first and future collaborative editing
- Keyboard shortcut handling

The `apps/web` SvelteKit app mounts components from this package. Logic lives here; the app is a thin shell.

---

## Development

```bash
# From repo root
pnpm --filter @claros/editor-core build
pnpm --filter @claros/editor-core test

# Watch mode
pnpm --filter @claros/editor-core dev   # if a dev script is configured
```

---

## Setting Up TipTap

Install TipTap and Yjs:

```bash
pnpm --filter @claros/editor-core add @tiptap/core @tiptap/starter-kit
pnpm --filter @claros/editor-core add @tiptap/extension-link @tiptap/extension-code-block
pnpm --filter @claros/editor-core add yjs y-prosemirror
```

Configure the editor instance in `src/editor.ts`:

```typescript
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
// import custom extensions

export function createEditor(element: HTMLElement) {
  return new Editor({
    element,
    extensions: [
      StarterKit,
      // WikilinkExtension,
      // EmergenceBlockExtension,
    ],
  })
}
```

---

## Extension Structure

Each Claros-specific feature should be its own TipTap extension:

```
src/
  editor.ts                 Editor factory
  extensions/
    wikilink.ts             [[Target]] link rendering
    emergence-block.ts      Fenced emergence block node
    emergence-inline.ts     {{oracle: ...}} inline syntax
    frontmatter.ts          YAML frontmatter header display
  components/
    EmergenceBlock.svelte   (if using Svelte node views)
```

---

## Dependencies

This package depends on:

| Package | Status | Notes |
|---|---|---|
| `@claros/emergence-engine` | ✅ Stable | Use for macro invocation |
| `@claros/story-state` | ⬜ Stub | Do not import yet — use mocks |

When `story-state` (Iter 09) is implemented, wire up:
- Wikilink resolution (what file does `[[Target]]` point to?)
- Backlink index
- Entity autocomplete

---

## Emergence Block Integration

The emergence-engine API for macro execution is stable. When wiring up block resolution:

```typescript
import { parseMacro, executeMacro } from "@claros/emergence-engine"
import type { MacroResult } from "@claros/emergence-engine"

// Load macro from the project's modules/ directory
const macro = parseMacro(macroYaml)

// Execute on user trigger
const result: MacroResult = await executeMacro(macro, userParams, tables)

// Write result back into the block's YAML
// result.output contains the macro's declared output values
```

See [`docs/EDITOR.md`](../../docs/EDITOR.md) for the full emergence block lifecycle and file format conventions.

---

## Constraints

- This package must never be imported by `@claros/emergence-engine` or `@claros/story-format`
- Do not implement oracle logic, dice rolling, or macro resolution here — delegate to `@claros/emergence-engine`
- Do not implement wikilink indexing here — that belongs in `@claros/story-state`
- Do not define the canonical file format — that belongs in `@claros/story-format`

---

## See Also

- [`docs/EDITOR.md`](../../docs/EDITOR.md) — comprehensive editor development guide, open UX questions, file format conventions
- [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) — full system architecture
