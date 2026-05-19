# Claros — Architecture

Claros is a local-first semantic Markdown writing app.

## Current Package Structure

- `@claros/story-format` — parsing, project conventions, and state/document schemas
- `@claros/emergence-engine` — macro execution and emergence processing
- `@claros/story-state` — workspace API, file-backed state, project indexing, wikilinks, backlinks, and run provenance
- `@claros/editor-core`, `apps/web`, `apps/desktop` — Silas-owned editor surfaces that consume the workspace API contract

## Dependency Direction

```text
apps/*
  ↓
@claros/story-state
  ├── @claros/emergence-engine
  └── @claros/story-format

@claros/editor-core
  ↓
@claros/story-state
```

The editor-facing packages consume `@claros/story-state`. Agent PRs should treat that package as the stable integration boundary.

## Emergence Artifacts

Emergence artifacts in manuscripts are `[!claros]` Markdown blockquotes (ADR-027).

Fenced `emergence` blocks and `{{oracle:}}` inline syntax are not implemented.

## State Storage

State lives in `state/` YAML files.

Macro run provenance is stored in `state/runs/emergence.yaml`.

## Decisions

For detailed decisions see `decisions/` and `decisions/README.md`.
