# State Format

This document describes the canonical state surfaces currently used by Claros.

## Canonical State Locations

Current state lives in YAML files under `state/` and in note frontmatter namespaces.

### YAML files

- `state/story.yaml`
- `state/chapters/<chapter-id>.yaml`
- `state/scenes/<scene-id>.yaml`
- `state/runs/emergence.yaml`

### Note frontmatter

Top-level module namespaces in notes, for example:

- `osr.hp.current`
- `mythic.status`

## State Scopes

`FileStateAdapter` exposes three YAML-backed scopes:

- story
- chapter
- scene

Conceptually:

```ts
getStory(path);
setStory(path, value);
getChapter(chapterId, path);
setChapter(chapterId, path, value);
getScene(sceneId, path);
setScene(sceneId, path, value);
```

The adapter persists free-form YAML object data. Claros core does not impose module-specific schemas below these scope roots.

## Story State

Story state is stored in:

```text
state/story.yaml
```

Example:

```yaml
mythic:
  chaos_factor: 5
lists:
  npcs:
    - label: Kareth
      weight: 2
      entity: notes/characters/kareth.md
```

## Chapter State

Chapter state is stored in:

```text
state/chapters/<chapter-id>.yaml
```

Example:

```yaml
route:
  current: north
```

## Scene State

Scene state is stored in:

```text
state/scenes/<scene-id>.yaml
```

Example:

```yaml
mythic:
  chaos_factor: 6
```

Scene IDs may include directory separators when derived from manuscript paths, so nested files under `state/scenes/` are valid and used.

Examples:

```text
state/scenes/2-into-the-dark.yaml
state/scenes/01-prologue/01-opening.yaml
```

## State Path Semantics

Claros uses dotted path access for YAML-backed state and note frontmatter state.

Examples:

- `mythic.chaos_factor`
- `route.current`
- `osr.hp.current`

Missing paths read as `undefined`. Writes create intermediate objects as needed.

## Note Frontmatter State

Note state is intentionally not wrapped in a special `state:` object.

Example note frontmatter:

```yaml
---
title: Kareth
aliases:
  - Lord of Stormfall
osr:
  hp:
    current: 28
    max: 28
mythic:
  status: active
---
```

Workspace APIs read/write these paths directly:

```ts
await project.getNoteFrontmatterPath(note, "osr.hp.current");
await project.setNoteFrontmatterPath(note, "osr.hp.current", 24);
```

A top-level `state` key has no special behavior in current core.

## Macro Run Ledger

Macro provenance is stored in:

```text
state/runs/emergence.yaml
```

Current ledger APIs support both of these on-disk shapes:

- a top-level YAML sequence
- an object with a top-level `runs:` sequence

The writer preserves the existing shape when updating the file.

### Ledger entry shape

Current `MacroRunLedgerEntry` fields:

```yaml
- id: "00003"
  created_at: "2026-05-19T15:00:00.000Z"
  macro: mythic.fate-question
  document: manuscript/01-prologue/01-opening.md
  chapter_id: 01-prologue
  scene_id: 01-prologue/01-opening
  params:
    intent: "Does the priest recognize the blade?"
    odds: likely
  rolls:
    - notation: 1d100
      total: 42
      values: [42]
  output:
    result: yes
  display:
    format: markdown
    block: |
      > [!claros] Mythic Fate Question
      > ...
      > [claros-run: 00003]
  effects:
    - target: state.scenes[01-prologue/01-opening].mythic.chaos_factor
      old: 5
      new: 4
```

`effects.target` values in the ledger are stored as resolved strings, with `scene_id` / `chapter_id` substitutions already applied.

Required fields in practice:

- `id`
- `created_at`
- `macro`
- `params`
- `rolls`
- `output`

Context/display/effects are included when available.

### Run IDs

Run IDs are zero-padded and monotonically increasing within the ledger file.

## Mutation Semantics

Current guarantees from the file-backed state/workspace layer:

- YAML state writes may be canonically rewritten
- note frontmatter writes preserve the markdown body exactly
- file-backed document writes use atomic write semantics through `ProjectFileWriter.writeFileAtomic`
- run-ledger writes use atomic file replacement behavior

## Deferred

Not yet implemented as stable MVP behavior:

- Git-backed checkpoint internals
- deterministic replay across module upgrades
- comment/CST-preserving YAML editing
- typed validation for specific module-owned state schemas

## Source Planning Docs

This repo-local reference was synthesized from Iter 05–07 planning, the ADR-024 delta, ADR-026, ADR-027, and Iter 10–12 planning material.
