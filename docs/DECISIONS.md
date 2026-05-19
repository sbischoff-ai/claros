# Claros MVP Decisions Summary

This is the repo-local summary of the design decisions most relevant to current editor, CLI, and workspace development.

It is intentionally shorter than the original ADR set and focuses on the decisions that materially shape package usage on `main`.

## ADR-021 — Editor Surface

**Decision:** the primary writing surface is CodeMirror 6 with live semantic WYSIWYG Markdown.

Implications for repo/package work:

- markdown files remain canonical
- the editor should consume package APIs rather than invent a hidden document model
- rich presentation belongs in editor packages, not in file-format changes
- raw markdown source mode remains secondary to the writer-facing live view

## ADR-023 — Project Manifest and Manuscript Structure

**Decision:** Claros projects use a root `claros.yaml` plus fixed core folders.

Key rules:

- `claros.yaml` lives at project root
- `manuscript/` is the canonical manuscript root
- chapter and scene identity come from sequence-prefixed paths
- scenes do not live directly under `manuscript/`
- scene/chapter IDs are path-derived, not frontmatter-derived

## ADR-024 — Notes, Wikilinks, and Note State

**Decision:** all markdown files under `notes/` are notes; there is no hardcoded entity taxonomy in core.

Key rules:

- `title`, `aliases`, `tags`, and `type` are conventions
- note frontmatter is permissive and unknown keys are preserved
- module-owned note state lives under top-level namespaces such as `osr` or `mythic`
- `frontmatter.state` is not a special API surface
- wikilink resolution order is explicit path -> title -> aliases -> slug/path fallback
- ambiguous matches must remain ambiguous rather than silently choosing one

## ADR-025 — Workspace API and Derived Indexing

**Decision:** `FileStateAdapter` is not the whole public boundary; the editor and CLI consume a higher-level workspace API.

Key rules:

- `openProject(root)` returns `ClarosProject`
- editor-safe capabilities include listing docs, reading/writing markdown, resolving links, accessing state/frontmatter paths, searching, listing Claros blocks, and reading macro runs
- the project index is derived from canonical files and is swappable behind an interface
- MVP uses an in-memory, file-derived index

## ADR-026 — Mutation and Checkpoint Semantics

**Decision:** Claros is a local-first semantic Markdown app.

Key rules:

- save writes canonical files
- checkpoint is a separate semantic versioning action
- autosave does not imply Git commits
- canonical file writes should be atomic
- frontmatter-only mutations preserve markdown body bytes
- dirty means uncheckpointed work, not unsaved work
- restore/timeline behavior is a future Git-facing layer, not a hidden database rewind

## ADR-027 — Emergence Blocks and Run Ledger

**Decision:** split display from provenance.

Key rules:

- manuscript-visible emergence results are `[!claros]` markdown blockquotes
- provenance lives in `state/runs/emergence.yaml`
- run IDs are linked by trailing `[claros-run: <id>]` markers
- manuscript blocks are editable and do not need to stay identical to the ledger forever
- fenced YAML `emergence` blocks are superseded

## What Is Implemented Now

On current `main`, these decisions already show up in code as:

- strict project scanning in `@claros/story-format`
- note-frontmatter state helpers and workspace APIs in `@claros/story-state`
- in-memory project indexing with title/alias/tag/link/Claros/run metadata
- document-context macro execution with run ledger writes and optional `[!claros]` insertion
- placeholder checkpoint API shape, with Git internals explicitly deferred

## What Is Still Deferred

These are important product decisions, but they are not fully implemented yet:

- Git-backed checkpoint/timeline internals (planned beyond current Iter 12 work)
- richer structural mutation flows such as rename/move/link-rewrite UX
- editor implementation details in `apps/web`, `apps/desktop`, and `@claros/editor-core`
- persistent index backends
- deterministic macro replay/module lockfiles
- collaboration/CRDT sync

## Source Planning Docs

This summary was synthesized from ADR-021 through ADR-027 and aligned to the current package code on `main`.
