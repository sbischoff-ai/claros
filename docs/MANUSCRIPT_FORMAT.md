# Manuscript and Note Format

This document describes the markdown-facing parts of Claros as currently implemented by `@claros/story-format` and consumed by `@claros/story-state`.

## Markdown Document Model

`parseMarkdownDocument(path, raw)` returns:

- `path`: relative project path
- `raw`: full document bytes as a string
- `frontmatter`: parsed YAML object when a leading frontmatter block exists
- `body`: markdown content after frontmatter

Frontmatter is only parsed from a leading `---` fenced block at the start of the file.

## Chapter and Scene Documents

Scene identity is path-derived, not frontmatter-derived.

From a scene file such as:

```text
manuscript/01-prologue/02-arrival.md
```

Claros derives:

- `scene.id = 01-prologue/02-arrival`
- `scene.chapterId = 01-prologue`
- `scene.sequence = 2`
- `scene.slug = arrival`
- `scene.path = manuscript/01-prologue/02-arrival.md`

Scene frontmatter is optional metadata and may include fields like:

```yaml
---
title: "Arrival"
---
```

Current code treats frontmatter as metadata only. It does not override scene ID, order, or chapter membership.

## Notes

All markdown files under `notes/` are treated as notes.

Typical note frontmatter:

```yaml
---
title: Kareth
aliases:
  - Lord of Stormfall
tags:
  - character
type: character
osr:
  hp:
    current: 28
    max: 28
---
```

Current conventions:

- `title`: display/resolution title
- `aliases`: alternate titles for link resolution
- `tags`: note categorization/search metadata
- `type`: optional convention, not a core schema
- unknown keys: preserved

### Note state namespaces

Module-owned note state lives directly under top-level namespace keys such as `osr`, `mythic`, or `ironsworn`.

Examples:

- `osr.hp.current`
- `mythic.status`
- `title`

There is **no** special `frontmatter.state` convention in current Claros core.
A top-level `state:` key, if present, is just ordinary frontmatter unless an integration chooses to interpret it.

## Frontmatter Mutation Guarantees

When Claros mutates note frontmatter through the note helper or workspace APIs:

- the markdown body is preserved exactly
- unknown frontmatter keys are preserved unless explicitly changed
- top-level module namespaces are written directly

This is an ADR-026 guarantee and is covered by tests in `@claros/story-state`.

## Wikilinks

`extractWikilinks(path, raw)` parses standard Obsidian-style links:

- `[[Kareth]]`
- `[[Kareth|the mercenary]]`
- `[[notes/characters/kareth.md|Kareth]]`

Each parsed wikilink includes:

- `fromPath`
- `target`
- optional `alias`
- source `range`

### Resolution order

The in-memory project index resolves note targets in this order:

1. explicit path
2. note `title`
3. note `aliases`
4. filename/path slug fallback

Duplicate title/alias matches are treated as ambiguity rather than silently picking a winner.

## Claros Blocks

Writer-facing emergence results are plain markdown blockquotes marked with `[!claros]`.

Example:

```markdown
> [!claros] Mythic Fate Question
> **Question:** Does the priest recognize the blade?
>
> 🎲 `1d100 → 42`
>
> **Yes.**
>
> [claros-run: 00003]
```

### Parsing rules

`extractClarosBlocks(path, raw)` recognizes a block as a Claros block when:

- it is a blockquote
- the first non-empty quoted line begins with `[!claros]` (case-insensitive)

The returned `ClarosBlockRef` includes:

- `fromPath`
- optional `title`
- optional `runId`
- `raw`
- source `range`

### Run marker rules

`extractClarosRunId(raw)` only extracts a run ID from a **trailing marker-only line**:

```markdown
> [claros-run: 00003]
```

Inline mentions of `[claros-run: ...]` elsewhere in block content do not count.

### Export stripping

`stripClarosMarkers(raw)` removes:

- the `[!claros]` marker
- marker-only `[claros-run: ...]` lines

This supports export/render pipelines that want the human-facing content without Claros markers.

## Macro Display vs Provenance

The manuscript block is a display artifact. The provenance record lives separately in `state/runs/emergence.yaml`.

That means:

- the block is user-editable
- the run ledger records what created it
- Claros does not require the edited manuscript block to remain identical to the ledger display forever

## Deferred

These are not current canonical manuscript formats:

- fenced YAML `emergence` blocks
- manually typed persisted pending invocation syntax
- rich WYSIWYG document markup stored separately from markdown

## Source Planning Docs

This repo-local reference was synthesized from ADR-023, ADR-024, ADR-027, the ADR-027 delta/amendment docs, and Iter 09–10 planning material.
