# @claros/web

SvelteKit web application for Claros.

**Current state:** Early project-aware Markdown editor host.

---

## Development

```bash
# From repo root
pnpm --filter @claros/web dev      # start dev server (http://localhost:5173)
pnpm --filter @claros/web build    # production build
pnpm --filter @claros/web test     # run tests
```

Or from this directory:

```bash
pnpm dev
pnpm build
pnpm test
```

---

## Stack

- **SvelteKit** — app framework and routing
- **CodeMirror 6** — prose-first Markdown editor, via `@claros/editor-core`
- **Yjs** (future) — CRDT document model, via `@claros/editor-core`

The web app is a thin consumer of `@claros/editor-core`. Business logic belongs in packages, not here.

---

## What to Build Here

- SvelteKit routing and layout
- Project workspace UI (header, navigation, eventual file picker/recent projects)
- Editor page that hosts the `@claros/editor-core` Markdown editor
- Command palette shell
- Settings and preferences

---

## What Belongs in `@claros/editor-core` Instead

All editor logic that should be reusable outside the web app belongs in `@claros/editor-core`:

- CodeMirror editor setup and extensions
- Theme tokens and prose-first Markdown presentation
- Wikilink rendering
- Emergence block rendering and interaction
- Keyboard shortcuts and vim-mode (when implemented)

The web app mounts the editor component; it does not implement the editor.

---

## Package Dependencies

```
@claros/web
  └── @claros/editor-core
        └── @claros/story-state       [workspace API boundary]
```

Production editor behavior should target `@claros/story-state` rather than importing `@claros/emergence-engine` directly. The current web UI uses an app-local sample project adapter for browser-only workspace prototyping until it is wired to the real `ClarosProject` API.

---

## See Also

- [`docs/EDITOR.md`](../../docs/EDITOR.md) — editor architecture, file format conventions, what to build and what not to touch
- [`packages/editor-core/README.md`](../../packages/editor-core/README.md) — editor package development guide
