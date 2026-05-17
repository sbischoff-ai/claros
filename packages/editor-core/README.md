# @claros/editor-core

CodeMirror-based prose Markdown editor package for Claros.

**Current state:** Early editor foundation. This package is not spec-gated and can be developed freely in parallel with the emergence engine iteration plan.

---

## Purpose

`editor-core` is the reusable editor package. It provides:

- The CodeMirror editor instance and configuration
- Prose-first Markdown editing with subtle syntax treatment
- Theme tokens for app, editor, prose, selection, marker, and widget surfaces
- Keyboard shortcut handling, including optional Vim mode
- Future extensions for Claros-specific markup such as wikilinks, emergence blocks, and frontmatter
- A future Yjs document model for offline-first and collaborative editing

The `apps/web` SvelteKit app mounts this package. Logic lives here; the app is a thin shell.

---

## Development

```bash
# From repo root
pnpm --filter @claros/editor-core build
pnpm --filter @claros/editor-core test
```

---

## Editor API

```typescript
import { createMarkdownEditor } from "@claros/editor-core";

const editor = createMarkdownEditor({
  parent: element,
  doc: "# Scene\n\nProse...",
  vimMode: false,
  onChange: (markdown) => saveDraft(markdown),
});

editor.setVimMode(true);
editor.setTheme({ proseFontSize: "21px" });
```

---

## Extension Structure

Each Claros-specific feature should be its own CodeMirror extension or view plugin:

```
src/
  editor.ts                 Editor factory
  markdown-markers.ts       Quiet Markdown syntax decorations
  theme.ts                  Semantic theme tokens
  extensions/
    wikilink.ts             [[Target]] link rendering
    emergence-block.ts      Fenced emergence block treatment
    emergence-inline.ts     {{oracle: ...}} inline syntax
    frontmatter.ts          YAML frontmatter header display
```

---

## Dependencies

This package depends on:

| Package                    | Status    | Notes                         |
| -------------------------- | --------- | ----------------------------- |
| `@claros/emergence-engine` | ✅ Stable | Use for macro invocation      |
| `@claros/story-state`      | ⬜ Stub   | Do not import yet — use mocks |

When `story-state` (Iter 09) is implemented, wire up:

- Wikilink resolution
- Backlink index
- Entity autocomplete

---

## Constraints

- This package must never be imported by `@claros/emergence-engine` or `@claros/story-format`
- Do not implement oracle logic, dice rolling, or macro resolution here — delegate to `@claros/emergence-engine`
- Do not implement wikilink indexing here — that belongs in `@claros/story-state`
- Do not define the canonical file format — that belongs in `@claros/story-format`
