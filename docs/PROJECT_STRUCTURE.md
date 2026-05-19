# Project Structure

This document describes the canonical Claros project layout currently implemented by `@claros/story-format` and consumed by `@claros/story-state`.

## Fixed MVP Layout

Current project scanning requires:

- a root `claros.yaml`
- a root `manuscript/` directory

`notes/` is optional. `state/` is created and used by state/workspace APIs as needed.

```text
<project-root>/
  claros.yaml
  manuscript/
    01-prologue/
      chapter.yaml
      01-opening.md
      02-arrival.md
    02-journey/
      chapter.yaml
      01-road.md
  notes/
    characters/
      kareth.md
    places/
      ancient-ruin.md
  state/
    story.yaml
    chapters/
      01-prologue.yaml
    scenes/
      01-prologue/01-opening.yaml
    runs/
      emergence.yaml
  modules/
    mythic-gme-2e/
      module.yaml
      macros/
      tables/
```

## Root Manifest: `claros.yaml`

`claros.yaml` is the canonical project manifest.

It is parsed as free-form YAML object data. Unknown keys are preserved.

Common keys used by the current code and docs:

```yaml
claros: 1

title: "Project Title"
subtitle: "Optional subtitle"
author:
  name: "Author Name"

exports:
  defaults:
    template: manuscript

modules:
  - mythic-gme-2e
```

### Path Configuration Limitation

The parser currently enforces the standard folder names. If `claros.yaml` contains `paths.*`, these values must still be the defaults:

- `manuscript`
- `notes`
- `state`
- `assets`
- `.claros`

Alternate core folder layouts are **not** implemented in MVP.

## Manuscript Rules

Manuscript structure is strict and path-derived.

### Chapter directories

Chapter directories must match:

```text
<sequence>-<kebab-slug>
```

Examples:

- `01-prologue`
- `2-the-abandoned-temple`

From this, `story-format` derives:

- `chapter.id`
- `chapter.sequence`
- `chapter.slug`
- `chapter.path`

### Scene files

Scene markdown files must live inside a chapter directory and must match:

```text
<sequence>-<kebab-slug>.md
```

Examples:

- `01-opening.md`
- `2-into-the-dark.md`

Direct markdown files under `manuscript/` are invalid in MVP.

Scene identity is derived from the path:

```text
scene.id = <chapter-id>/<scene-file-stem>
```

For example:

```text
manuscript/01-prologue/02-arrival.md
=> scene.id = 01-prologue/02-arrival
```

### `chapter.yaml`

A chapter folder may include an optional `chapter.yaml`.

It is free-form YAML metadata. A common field is `title`, but unknown keys are preserved.

If `title` is absent, the parser falls back to `Chapter <sequence>` for display purposes.

## Notes

All markdown files under `notes/` are notes.

- folders are organizational only
- note identity is filepath-based
- title/aliases/tags/type come from frontmatter conventions
- unknown frontmatter is preserved

There is no hardcoded entity taxonomy in core Claros.

## State Directory

`state/` stores canonical YAML state, not derived caches.

Current state files:

- `state/story.yaml`
- `state/chapters/<chapter-id>.yaml`
- `state/scenes/<scene-id>.yaml`
- `state/runs/emergence.yaml`

Digit-prefixed scene and chapter IDs are intentional and valid.

Examples:

```text
state/chapters/1-the-abandoned-temple.yaml
state/scenes/2-into-the-dark.yaml
state/scenes/01-prologue/01-opening.yaml
```

## Module Directories

Current workspace macro execution resolves module directories from `manifest.modules`.

Supported forms:

```yaml
modules: mythic-gme-2e
```

```yaml
modules:
  - mythic-gme-2e
  - ./vendor/custom-module
```

```yaml
modules:
  mythic-gme-2e: enabled
  local-pack: true
  custom:
    path: ./vendor/custom-module
```

For each module entry, `openProject()` currently tries:

1. the absolute path as given
2. `<projectRoot>/<entry>`
3. `<projectRoot>/modules/<entry>`

Only existing directories are loaded.

### Current module manifest format

A module directory is expected to contain `module.yaml`:

```yaml
id: mythic-gme-2e
name: "Mythic GME 2e"
version: "0.1.0"
macros:
  - macros/fate-question.yaml
  - macros/scene-setup.yaml
tables:
  - tables/fate-chart.yaml
  - tables/event-focus.yaml
```

`loadModuleFromDirectory()` then parses and registers those macro/table files.

## What Is Canonical vs Derived

Canonical:

- `claros.yaml`
- `manuscript/**/*.md`
- `chapter.yaml`
- `notes/**/*.md`
- `state/**/*.yaml`

Derived/disposable:

- the in-memory project index in `@claros/story-state`
- search metadata
- backlink maps
- title/alias/tag indexes

## Deferred

These are design topics, not current guarantees:

- alternate core project paths beyond the fixed MVP layout
- module dependency lockfiles or replay pinning
- project-global vs user-global module search outside the current `manifest.modules` resolution behavior
- persistent project indexes or cache directories as canonical state

## Source Planning Docs

This repo-local reference was synthesized from ADR-023, ADR-024, ADR-025, Iter 09, and Iter 12 planning material.
