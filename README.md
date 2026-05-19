# Claros

Claros is a markdown-first fiction writing and solo roleplay environment built around canonical files, procedural emergence tools, and an editor-facing workspace API.

## Current Product Shape

Claros is designed as a **local-first semantic Markdown writing app**:

- markdown and YAML files are canonical
- chapters, scenes, notes, and state live in a legible project tree
- procedural systems are defined by YAML macros and tables, not hardcoded game logic
- the editor consumes package APIs instead of owning the data model
- emergence results appear in manuscripts as writer-facing `[!claros]` blocks linked to a YAML run ledger

## Current Package Boundaries

### `@claros/story-format`

Canonical project/file format support:

- project scanning and validation
- markdown/frontmatter parsing
- wikilink extraction
- `[!claros]` block extraction
- state file parsing/serialization
- random table parsing

### `@claros/emergence-engine`

Procedural resolution engine:

- dice parsing and rolling
- expression evaluation
- random-table and matrix lookup
- macro parsing and execution
- module registry loading
- hook registration

### `@claros/story-state`

Editor/CLI-facing semantic workspace layer:

- `openProject(root)` and `ClarosProject`
- document read/write
- story/chapter/scene state access
- note frontmatter path access
- in-memory project indexing
- wikilink resolution, backlinks, and search
- `[!claros]` block listing
- document-context macro execution
- macro run ledger access
- checkpoint API shape

## Repo-Local Docs

The repo now includes the core reference set needed for MVP editor development.

Start here:

- [docs/README.md](docs/README.md)
- [docs/EDITOR_INTERFACE_CONTRACT.md](docs/EDITOR_INTERFACE_CONTRACT.md)
- [docs/WORKSPACE_API.md](docs/WORKSPACE_API.md)
- [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md)
- [docs/MANUSCRIPT_FORMAT.md](docs/MANUSCRIPT_FORMAT.md)
- [docs/STATE_FORMAT.md](docs/STATE_FORMAT.md)
- [docs/RANDOM_TABLES.md](docs/RANDOM_TABLES.md)
- [docs/MACRO_DSL.md](docs/MACRO_DSL.md)
- [docs/DECISIONS.md](docs/DECISIONS.md)

## Example Project Shape

```text
project/
  claros.yaml
  manuscript/
    01-prologue/
      chapter.yaml
      01-opening.md
      02-arrival.md
  notes/
    characters/kareth.md
  state/
    story.yaml
    scenes/01-prologue/01-opening.yaml
    runs/emergence.yaml
  modules/
    mythic-gme-2e/
```

## Current Status

Implemented on current `main`:

- dice engine
- random-table and matrix parsing/lookup
- expression evaluation
- macro parsing/execution/composition
- canonical project scanning and markdown parsing
- `[!claros]` emergence block parsing and run marker handling
- YAML run ledger for macro provenance
- in-memory project indexing
- file workspace API for editor/CLI integration

Explicitly deferred:

- full editor implementation details
- Git-backed checkpoint/timeline internals
- persistent index backends
- collaboration/CRDT sync
- deterministic replay/module lockfiles

## Quick Start

Requires Node.js 20+ and pnpm 9+.

```bash
pnpm install
pnpm build
pnpm test
```

Run the web app scaffold:

```bash
pnpm --filter @claros/web dev
```

## Development Notes

- TypeScript strict mode is expected throughout.
- Canonical files matter more than caches.
- If you are integrating the editor, prefer `@claros/story-state` over direct low-level package internals.

See [AGENTS.md](AGENTS.md) for contributor/agent guidance.
