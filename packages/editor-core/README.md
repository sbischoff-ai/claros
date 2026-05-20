# @claros/editor-core

**Silas-owned package. Agent PRs must not modify this package.**

This package implements the CodeMirror 6 editor surface for Claros. See `docs/DECISIONS.md` for the editor surface decision summary.

## Emergence Display

Claros emergence results in manuscripts are `[!claros]` Markdown blockquotes. The editor renders these as styled callout blocks. Fenced `emergence` blocks and `{{oracle:}}` inline syntax are not implemented.

## API Contract

The editor consumes `@claros/story-state`'s `ClarosProject` API. See `packages/story-state` and `docs/EDITOR.md`.
