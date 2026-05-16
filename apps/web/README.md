# @claros/web

SvelteKit web application for Claros.

**Current state:** Scaffold only — routes exist, no editor functionality yet.

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
- **TipTap** (planned) — rich text editor, via `@claros/editor-core`
- **Yjs** (planned) — CRDT document model, via `@claros/editor-core`

The web app is a thin consumer of `@claros/editor-core`. Business logic belongs in packages, not here.

---

## What to Build Here

- SvelteKit routing and layout
- Project open/save UI (file picker, recent projects)
- Editor page that hosts the `@claros/editor-core` editor component
- Command palette shell
- Settings and preferences

---

## What Belongs in `@claros/editor-core` Instead

All editor logic that should be reusable outside the web app belongs in `@claros/editor-core`:

- TipTap editor setup and extensions
- Wikilink rendering
- Emergence block rendering and interaction
- Keyboard shortcuts and vim-mode (when implemented)

The web app mounts the editor component; it does not implement the editor.

---

## Package Dependencies

```
@claros/web
  └── @claros/editor-core   [stub — build here]
        ├── @claros/story-state       [stub — Iter 09]
        └── @claros/emergence-engine  [✅ stable]
```

You can import `@claros/emergence-engine` for wiring up oracle features now.
Do not import `@claros/story-state` yet — it is an empty stub.

---

## See Also

- [`docs/EDITOR.md`](../../docs/EDITOR.md) — editor architecture, file format conventions, what to build and what not to touch
- [`packages/editor-core/README.md`](../../packages/editor-core/README.md) — editor package development guide
