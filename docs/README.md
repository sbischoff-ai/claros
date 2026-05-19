# Claros Docs

This directory is the repo-local reference set for MVP Claros development.

If you are building editor, CLI, or integration code against the current packages, you should be able to stay inside this repo and use these docs plus the package source.

## Recommended Reading Order

1. [EDITOR_INTERFACE_CONTRACT.md](EDITOR_INTERFACE_CONTRACT.md) — stable editor-facing API boundary
2. [WORKSPACE_API.md](WORKSPACE_API.md) — `openProject(...)`, `ClarosProject`, helpers, indexing, macro execution
3. [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) — `claros.yaml`, fixed folders, module resolution
4. [MANUSCRIPT_FORMAT.md](MANUSCRIPT_FORMAT.md) — chapter/scene/note markdown, wikilinks, `[!claros]` blocks
5. [STATE_FORMAT.md](STATE_FORMAT.md) — YAML state files, note frontmatter state, run ledger
6. [RANDOM_TABLES.md](RANDOM_TABLES.md) — random table and matrix table schemas
7. [MACRO_DSL.md](MACRO_DSL.md) — macro YAML, params, steps, effects, output, hooks
8. [DECISIONS.md](DECISIONS.md) — design-decision summary relevant to MVP editor work
9. [ARCHITECTURE.md](ARCHITECTURE.md) — high-level package boundaries and dependency direction

Supporting docs:

- [EDITOR.md](EDITOR.md) — editor posture and repo guidance
- [EDITOR_USER_MANUAL.md](EDITOR_USER_MANUAL.md) — user-facing editor manual

## What These Docs Describe

These docs are intentionally scoped to the current code on `main` after Iter 12 / PR #23:

- `@claros/story-format` for canonical project/file parsing
- `@claros/emergence-engine` for dice, tables, expressions, macros, hooks, and module loading
- `@claros/story-state` for file-backed state, the workspace API, the in-memory project index, and macro run provenance

Where planning docs go beyond current implementation, these repo docs call that out explicitly as **deferred** rather than implying it already exists.

## Source Planning Docs

These repo docs were synthesized from the accepted ADRs and iteration specs that originally lived in Nextcloud, especially:

- ADR-021 through ADR-027
- Iter 01 through Iter 12 planning docs
- macro DSL and ADR-027 amendment docs

You should not need those planning docs to work productively from the repo now.
