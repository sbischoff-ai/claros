# Claros Architecture

Claros is organized around canonical markdown/YAML files plus a small set of reusable packages.

## Package Responsibilities

### `@claros/story-format`

Owns canonical project and document format concerns:

- project scanning and validation
- chapter/scene/note refs
- markdown/frontmatter parsing
- wikilink extraction
- `[!claros]` block extraction
- state file parsing/serialization
- table parsing
- file abstraction types such as `ProjectFileReader` and `ProjectFileWriter`

This package defines the durable file contract.

### `@claros/emergence-engine`

Owns procedural/emergence execution:

- dice parsing and rolling
- random-table and matrix lookups
- expression evaluation
- macro parsing
- macro execution
- hook dispatch registration
- module loading into a registry

This package is system-agnostic. Rulesets live in YAML modules, not in engine code.

### `@claros/story-state`

Owns the semantic workspace layer above canonical files:

- file-backed story/chapter/scene state access
- note frontmatter path helpers
- run ledger access
- document-context macro execution
- `openProject(...)` / `ClarosProject`
- in-memory project indexing
- wikilink resolution, backlinks, and search
- checkpoint API shape

This is the main integration boundary for editor and CLI consumers.

### Editor surfaces

- `@claros/editor-core`
- `apps/web`
- `apps/desktop`

These are consumers of the package APIs above. They are not the canonical data model.

## Dependency Direction

```text
@claros/story-format
        ↑
@claros/story-state
        ↑
 editor / CLI surfaces

@claros/emergence-engine
        ↑
@claros/story-state
```

More concretely:

- `story-state` depends on `story-format`
- `story-state` also depends on `emergence-engine`
- editor/CLI packages consume `story-state`
- editor/CLI packages do not need to own filesystem, parser, or macro-execution internals

## Canonical vs Derived Data

Canonical:

- markdown manuscript files
- markdown note files
- frontmatter
- `claros.yaml`
- `chapter.yaml`
- YAML state files
- `state/runs/emergence.yaml`

Derived:

- in-memory project index
- backlink maps
- search metadata
- title/alias/tag lookup maps

Derived state can be rebuilt from canonical files.

## Editor Boundary

The current editor-safe contract is:

- `openProject(root)`
- `ClarosProject`
- exported types re-exported from `@claros/story-state`

See:

- [EDITOR_INTERFACE_CONTRACT.md](EDITOR_INTERFACE_CONTRACT.md)
- [WORKSPACE_API.md](WORKSPACE_API.md)

## Emergence Boundary

Macros, tables, and dice logic live in `@claros/emergence-engine`, but editor consumers should normally execute macros through `@claros/story-state` so they get:

- project-aware module loading
- state adapter integration
- scene/chapter context derivation
- run ledger writes
- optional `[!claros]` block insertion
- index refreshes

## Current Deferred Boundaries

These are intentionally not yet implemented as stable internals:

- Git checkpoint/timeline internals
- persistent index backends
- collaboration/CRDT sync
- editor-owned canonical document model
- deterministic replay/module lockfiles

## Further Reading

- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)
- [MANUSCRIPT_FORMAT.md](MANUSCRIPT_FORMAT.md)
- [STATE_FORMAT.md](STATE_FORMAT.md)
- [RANDOM_TABLES.md](RANDOM_TABLES.md)
- [MACRO_DSL.md](MACRO_DSL.md)
- [DECISIONS.md](DECISIONS.md)
