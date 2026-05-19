# Editor

The Claros editor (`apps/web`, `apps/desktop`, `@claros/editor-core`) is developed by Silas in parallel against the workspace API contract.

**Agent PRs must not modify `apps/web`, `apps/desktop`, `@claros/editor-core`, or the export package.**

## Editor Interface Contract

The stable API boundary for the editor is documented in:

`packages/story-state` — `ClarosProject` API. See [`docs/EDITOR_INTERFACE_CONTRACT.md`](EDITOR_INTERFACE_CONTRACT.md) for the local repo copy used by editor/Codex tasks.

The editor consumes:

- `openProject(root)` → `ClarosProject`
- chapter/scene/note listing
- document read/write
- wikilink/backlink/search
- state and frontmatter path APIs
- macro execution in document context
- macro run ledger APIs
- checkpoint/timeline APIs

The editor does not need to import `@claros/emergence-engine` directly. All types needed by the editor are re-exported from `@claros/story-state`.

## Editor Surface Decision

See `decisions/ADR-021-editor-surface.md`: CodeMirror 6 with live semantic WYSIWYG Markdown rendering.
