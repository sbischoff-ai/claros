# Workspace API

This document describes the current editor/CLI-facing workspace boundary
implemented by `@claros/story-state`.

## Purpose

The workspace API is the integration boundary above raw filesystem parsing,
state adapter internals, and emergence-engine internals.

Editor and CLI code should consume this layer rather than manually stitching
together:

- file enumeration
- markdown parsing
- project indexing
- state adapter calls
- registry/module loading
- macro run ledger access

## Entry Point

```ts
import { openProject } from "@claros/story-state";

const project = await openProject(projectRoot);
```

`openProject(root, options?)`:

- normalizes the project root
- scans the canonical project structure through `scanProjectFormat`
- reads the macro run ledger
- builds the in-memory project index
- returns a `ClarosProject`

Browser consumers that provide their own file adapters can import the browser-safe entrypoint:

```ts
import { openProject } from "@claros/story-state/browser";

const project = await openProject("/", { fileReader, fileWriter });
```

This path avoids the default Node file implementations and is intended for browser APIs such as the File System Access API.

## `OpenProjectOptions`

The current workspace layer accepts file abstractions:

```ts
interface OpenProjectOptions {
  fileReader?: ProjectFileReader;
  fileWriter?: ProjectFileWriter;
}
```

These are the same abstractions used by document and frontmatter mutation flows.

### Default Node implementations

`@claros/story-state` exports:

- `NodeProjectFileReader`
- `NodeProjectFileWriter`

`NodeProjectFileWriter.writeFileAtomic()` is the default Node implementation of ADR-026 atomic write semantics.

## Core `ClarosProject` Surface

Current `ClarosProject` capabilities:

- `listChapters()`
- `listScenes()`
- `listNotes()`
- `readDocument(ref)`
- `writeDocument(ref, document)`
- `getStoryState(path)` / `setStoryState(path, value)`
- `getSceneState(sceneId, path)` / `setSceneState(sceneId, path, value)`
- `getChapterState(chapterId, path)` / `setChapterState(chapterId, path, value)`
- `getNoteFrontmatterPath(note, path)` / `setNoteFrontmatterPath(note, path, value)`
- `resolveWikilink(link, from?)`
- `getBacklinks(ref)`
- `search(query, options?)`
- `listClarosBlocks(ref?)`
- `executeMacroInDocument(options)`
- `listMacroRuns(filter?)`
- `getMacroRun(id)`
- `checkpoint(...)`
- `getCheckpointStatus()`
- `listCheckpoints(...)`
- `restoreCheckpoint(...)`

## Package-Level Helpers

`@claros/story-state` also exports explicit-root helpers for lower-level usage.

Examples:

- `readDocument(projectRoot, ref, options?)`
- `writeDocument(projectRoot, ref, document, options?)`
- `getStoryState(projectRoot, path)`
- `setSceneState(projectRoot, sceneId, path, value)`
- `getProjectNoteFrontmatterPath(projectRoot, note, path, options?)`
- `executeProjectMacroInDocument(projectRoot, options, openOptions?)`

`ClarosProject` methods are convenience wrappers around the same underlying behaviors.

## Document References

Current document refs are:

```ts
type DocumentRef = SceneRef | NoteRef | { path: string };
```

That lets callers use typed scene/note refs from the index or explicit relative paths.

## Read/Write Semantics

### Document reads

`readDocument()` returns `MarkdownDocument` with:

- `path`
- `raw`
- optional `frontmatter`
- `body`

### Document writes

`writeDocument()` writes canonical markdown content using `ProjectFileWriter.writeFileAtomic()`.

After writes performed through a `ClarosProject`, the in-memory project index is refreshed for the mutated document.

### Note frontmatter writes

`setNoteFrontmatterPath()` and related helpers:

- remain async
- preserve unknown frontmatter keys
- preserve the markdown body exactly
- write through the file writer abstraction
- refresh the in-memory project index when called through `ClarosProject`

### State writes

Story/chapter/scene state methods delegate to `FileStateAdapter`.
YAML state files may be canonically rewritten.

## Wikilinks, Backlinks, and Search

The current in-memory index provides:

- chapter/scene/note listings
- title/alias/path-based wikilink resolution
- outgoing links and backlinks
- tag lookup
- search results derived from canonical files and run metadata

Search metadata currently includes content derived from:

- scenes and notes
- note titles, aliases, tags
- module namespace keys in note frontmatter
- Claros block titles and run IDs
- macro run ledger metadata

## Claros Blocks and Macro Runs

### `listClarosBlocks()`

Returns parsed `[!claros]` blocks from manuscript and note markdown.

### `executeMacroInDocument()`

Current document-context behavior:

- derives scene/chapter context from the document path when applicable
- loads modules into a registry from `manifest.modules`
- runs the macro against the registry and `FileStateAdapter`
- appends a ledger entry to `state/runs/emergence.yaml`
- renders `display.format: markdown` / `display.markdown` templates, or a generic fallback
- inserts the rendered markdown display block only when `insertAt` is provided
- uses the workspace file reader and writer abstractions during insertion
- refreshes runs/index state afterward

### `listMacroRuns()` and `getMacroRun()`

These expose the run ledger to editor/CLI consumers without requiring direct YAML handling.

## Checkpoint API Status

The checkpoint API shape exists now, but Git internals do not.

Current behavior:

- `getCheckpointStatus()` returns a placeholder uncheckpointed-work shape
- `listCheckpoints()` returns an empty list
- `checkpoint()` throws `CheckpointNotImplementedError`
- `restoreCheckpoint()` throws `CheckpointNotImplementedError`

This is intentional. Iter 14-style Git/timeline internals are still deferred.

## In-Memory Project Index

The current `ProjectIndex` is file-derived and in memory.

It exposes:

- `build(snapshot, runs?)`
- `updateDocument(path, raw)`
- `removeDocument(path)`
- `updateRuns(runs)`
- listing/query methods for chapters, scenes, notes, Claros blocks, macro runs, links, backlinks, tags, and search

This index is derived state, not canonical storage.

## Editor Integration Guidance

If you are building the editor, the normal integration path is:

1. `openProject(root)`
2. build sidebar UI from `listChapters()`, `listScenes()`, `listNotes()`
3. load scene/note text with `readDocument()`
4. autosave prose with `writeDocument()`
5. read/update system state with state and frontmatter path APIs
6. resolve links through `resolveWikilink()` / `getBacklinks()`
7. invoke macros through `executeMacroInDocument()`
8. surface emergence history via `listMacroRuns()`
9. show checkpoint UI against the current placeholder API without assuming Git internals exist yet

## Deferred

Not current guarantees:

- browser-native workspace adapters bundled in core packages
- persistent index backends such as SQLite/IndexedDB
- raw Git/timeline implementation details
- richer structural mutation APIs beyond current document/frontmatter/state helpers

## Source Planning Docs

This repo-local reference was synthesized from ADR-025, ADR-026, ADR-027, the MVP editor contract, Iter 11, Iter 12, and current `@claros/story-state` source.
