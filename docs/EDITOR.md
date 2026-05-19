# Editor Development Notes

The Claros editor is developed against the workspace/package contract, not against raw parser or filesystem internals.

## Primary Boundary

If you are working on the editor, start here:

- [EDITOR_INTERFACE_CONTRACT.md](EDITOR_INTERFACE_CONTRACT.md)
- [WORKSPACE_API.md](WORKSPACE_API.md)
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)
- [MANUSCRIPT_FORMAT.md](MANUSCRIPT_FORMAT.md)
- [STATE_FORMAT.md](STATE_FORMAT.md)
- [MACRO_DSL.md](MACRO_DSL.md)

The editor should normally import from `@claros/story-state`, not directly from low-level internals.

## What the Editor Can Assume Today

Current package guarantees on `main`:

- `openProject(root)` returns `ClarosProject`
- sidebar data comes from `listChapters()`, `listScenes()`, and `listNotes()`
- markdown document reads/writes are available through the workspace API
- wikilink resolution, backlinks, and search are index-backed and exposed through `ClarosProject`
- note frontmatter paths are async and body-preserving
- macro execution in document context is available through `executeMacroInDocument(...)`
- `[!claros]` blocks and macro runs are queryable without touching raw ledger YAML
- checkpoint API shape exists, but checkpoint/restore internals are still deferred

## What the Editor Should _Not_ Assume Yet

Not implemented as stable MVP editor infrastructure yet:

- Git checkpoint/timeline internals
- rich structural mutation APIs for bulk rename/move/link-rewrite flows
- collaboration/CRDT sync
- editor-owned canonical document model
- persistent index backends

## Editor Surface Direction

Per ADR-021, the primary writing surface is CodeMirror 6 with live semantic WYSIWYG Markdown.

That affects package work in these ways:

- markdown remains canonical on disk
- package APIs should stay editor-agnostic
- visual/editor affordances belong in editor packages, not in the file format

## Repo Boundaries

Agent-owned package work focuses on the shared libraries and CLI/package contract.
Silas owns the live editor implementation in:

- `apps/web`
- `apps/desktop`
- `@claros/editor-core`

## Source Planning Docs

This repo note condenses ADR-021 plus the MVP editor contract and current package surface.
