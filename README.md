# Claros

Markdown-first fiction writing and solo roleplay environment with inline oracle systems, procedural storytelling tools, and collaborative prose editing.

**Status:** Active development — emergence engine complete through Iter 04 (macro executor). Editor not yet started.

---

## What Claros Is

Claros is a local-first writing environment for authors who use procedural tools — dice, oracles, random tables, RPG mechanics — as creative aids during writing or solo roleplay.

**Design principles:**

- Prose-first: the manuscript is always the canonical artifact
- Keyboard-first: designed for fast keyboard-driven workflows
- Offline-first: works entirely from local files
- Modular: oracle systems and RPG rulesets are text files, not engine code
- No AI writing features

The markdown files are canonical. All derived state (indexes, search, databases) is disposable and rebuildable from scratch.

---

## Repository Structure

```
claros/
  packages/
    story-format/        Canonical file format, project folder conventions, table YAML parser
    emergence-engine/    Dice evaluator, random table resolver, macro parser + executor
    story-state/         Wikilink index, backlinks, search, git integration  [stub]
    editor-core/         TipTap/ProseMirror editor package                   [stub]
    export/              Pandoc export pipeline                               [stub]

  apps/
    web/                 SvelteKit web app                                    [scaffold]
    desktop/             Tauri desktop shell                                  [deferred]
    cli/                 Command-line tools                                   [stub]

  docs/
    EDITOR.md            Editor development guide
    ARCHITECTURE.md      Full system architecture
```

---

## Package Status

| Package                    | Status                      | Extend freely?            |
| -------------------------- | --------------------------- | ------------------------- |
| `@claros/story-format`     | ✅ Table parser implemented | **No — spec-gated**       |
| `@claros/emergence-engine` | ✅ Iter 01–04 complete      | **No — spec-gated**       |
| `@claros/story-state`      | ⬜ Stub                     | Not yet (Iter 09–10)      |
| `@claros/editor-core`      | ⬜ Stub                     | **Yes — open**            |
| `@claros/export`           | ⬜ Stub                     | Not yet                   |
| `apps/web`                 | ⬜ SvelteKit scaffold       | **Yes — open**            |
| `apps/desktop`             | ⬜ Placeholder              | **Yes — open (deferred)** |
| `apps/cli`                 | ⬜ Stub                     | Not yet (Iter 11)         |

Spec-gated packages have detailed test suites and governing specs. Do not modify them without an explicit spec task. See [AGENTS.md](AGENTS.md).

---

## Quick Start

Requires: Node.js 20+, pnpm 9+

```bash
pnpm install          # install all workspace dependencies
pnpm turbo run build  # build all packages
pnpm turbo run test   # run all test suites
```

Run the web dev server:

```bash
pnpm --filter @claros/web dev
```

---

## Conventions

- **TypeScript strict mode** throughout — no `any` without a justifying comment
- **Vitest** for all tests; test files live in `tests/` adjacent to `src/` in each package
- **Injectable RNG** for all dice/randomness — never call `Math.random()` directly in testable code
- **No logic in stubs** — packages stay as `export {}` until a spec task is delegated
- **Markdown files are canonical** — SQLite/IndexedDB are derived state only

---

## Implementation Progress

| Iter | Scope                                         | Status       |
| ---- | --------------------------------------------- | ------------ |
| 00   | Monorepo scaffold                             | ✅           |
| 01   | Dice expression engine                        | ✅ 44 tests  |
| 02   | Table format parser + lookup                  | ✅           |
| 03   | Expression language (jexl)                    | ✅           |
| 04   | Macro parser + executor                       | ✅ 114 tests |
| 05   | Macro composition + state model               | ⬜           |
| 06   | Mythic GME integration milestone              | ⬜           |
| 07   | Story format: project structure + frontmatter | ⬜           |
| 08   | Emergence blocks in markdown                  | ⬜           |
| 09   | story-state: project indexing                 | ⬜           |
| 10   | Git integration                               | ⬜           |
| 11   | CLI foundation                                | ⬜           |
| 12   | Web editor foundation                         | ⬜           |
| 13   | Emergence UX in editor                        | ⬜           |

---

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full system architecture.
See [`docs/EDITOR.md`](docs/EDITOR.md) for the editor development guide.
See [`AGENTS.md`](AGENTS.md) for AI agent and spec-sensitive contributor guidance.
