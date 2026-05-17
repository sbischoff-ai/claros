# Claros — Agent & Contributor Guide

## Package Domains

| Package                    | Domain                                                                                   | Spec-sensitive? |
| -------------------------- | ---------------------------------------------------------------------------------------- | --------------- |
| `@claros/story-format`     | Canonical file format, project structure, frontmatter, wikilinks, emergence block syntax | **YES**         |
| `@claros/emergence-engine` | Dice evaluator, table resolver, macro runner, expression language                        | **YES**         |
| `@claros/story-state`      | Project indexing, wikilink resolution, backlinks, git integration, persistence adapters  | Yes             |
| `@claros/editor-core`      | TipTap/ProseMirror editor, inline emergence UX, collaboration                            | No              |
| `@claros/export`           | Pandoc pipeline, clean/annotated/actual-play export                                      | No              |

**Spec-sensitive packages:** Before modifying `story-format` or `emergence-engine`, check the governing specs in `docs/specs/`. These packages have detailed test suites; any change that causes test failures must be discussed, not silently fixed by relaxing tests.

## Conventions

- **TypeScript strict mode** throughout. No `any` without explicit justification in a comment.
- **Tests required** for every non-trivial function in `story-format` and `emergence-engine`. Target: all public API surface covered.
- **No logic in stubs.** Packages at scaffold stage export only empty `export {}` until a spec task is delegated.
- **Dice RNG is injectable.** The dice evaluator must accept an RNG function parameter for deterministic testing. Never call `Math.random()` directly in testable code.
- **YAML for modules.** All emergence modules (macros, tables) are YAML files under the project's `modules/` directory. No hardcoded system data in engine code.
- **File format is canonical.** The markdown files are the source of truth. SQLite/IndexedDB are derived state only and must be rebuildable from scratch.

## Test Style

- Framework: Vitest
- Tests live in `tests/` alongside `src/` in each package
- Descriptive test names: `describe("DiceEvaluator") > it("evaluates 2d20kh1 keeping the highest roll")`
- Use the injectable RNG for all dice tests — never assert on random output

## Codex Note

This repo may receive independent commits from a local Codex session. If you find changes in spec-sensitive packages that don't correspond to a delegated task, flag them in your response rather than silently building on them.

## Dependency Direction

```
story-format
      ↑
story-state

emergence-engine  (no internal deps)

editor-core
 ├── story-state
 └── emergence-engine
```
