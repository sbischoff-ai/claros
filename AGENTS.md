# Claros — Agent & Contributor Guide

## Parallel Development Lanes

This repo has two active development lanes:

- **Autonomous core agents** work under the `sbischoff-ai` GitHub identity on delegated core package tasks.
- **Local editor work** is paired with Silas on this NixOS laptop in `apps/web`, `apps/desktop`, and `@claros/editor-core`.

Autonomous agent PRs must not modify `apps/web`, `apps/desktop`, or `@claros/editor-core`. Local editor work may modify those packages when Silas explicitly asks for editor changes.

## Package Domains

| Package                    | Domain                                                                                                                                                                                                        | Spec-sensitive? |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `@claros/story-format`     | Canonical file format, project structure, frontmatter, wikilinks, emergence block syntax                                                                                                                      | **YES**         |
| `@claros/emergence-engine` | Dice evaluator, table resolver, macro runner, expression language                                                                                                                                             | **YES**         |
| `@claros/story-state`      | Project workspace API, FileStateAdapter, in-memory project index, wikilink resolution, backlinks, macro run ledger, Git checkpoint integration. Exposes the ClarosProject API consumed by the editor and CLI. | Yes             |
| `@claros/editor-core`      | CodeMirror 6 editor surface. **Silas-owned parallel work — autonomous agent PRs must not modify this package.**                                                                                               | No              |
| `apps/web`                 | SvelteKit web app. **Silas-owned parallel work — autonomous agent PRs must not modify this package.**                                                                                                         | No              |
| `apps/desktop`             | Tauri desktop shell. **Silas-owned parallel work — autonomous agent PRs must not modify this package.**                                                                                                       | No              |
| `@claros/export`           | Pandoc pipeline, clean/annotated/actual-play export                                                                                                                                                           | No              |

**Spec-sensitive packages:** `story-format` and `emergence-engine` define canonical behavior and have detailed test suites. Before changing them, check the relevant repo-local reference docs in `docs/`, especially `docs/DECISIONS.md`. Any change that causes test failures must be discussed, not silently fixed by relaxing tests.

## Conventions

- **TypeScript strict mode** throughout. No `any` without explicit justification in a comment.
- **Tests required** for every non-trivial function in `story-format` and `emergence-engine`. Target: all public API surface covered.
- **No logic in stubs.** Packages at scaffold stage export only empty `export {}` until a spec task is delegated.
- **Dice RNG is injectable.** The dice evaluator must accept an RNG function parameter for deterministic testing. Never call `Math.random()` directly in testable code.
- **YAML for modules.** All emergence modules (macros, tables) are YAML files under the project's `modules/` directory. No hardcoded system data in engine code.
- **File format is canonical.** The markdown files are the source of truth. SQLite/IndexedDB are derived state only and must be rebuildable from scratch.

## Architecture Discipline

- **One concept, one implementation.** If a behavior has a canonical implementation or public interface, use it. Do not create near-identical local versions in a consumer package.
- **Search before adding logic.** Before implementing parsing, projection, mutation, indexing, storage, or workflow behavior, check whether the repo already exposes the needed capability. Prefer adapting the shared implementation over adding a parallel one.
- **Keep layers separate.** Durable semantics belong in shared lower layers. UI, commands, transports, and platform adapters should translate inputs and outputs, not fork business rules.
- **Storage is an adapter boundary.** Different storage backends should differ in permission, transport, and file access details. They should not require duplicate domain logic for the same operation.
- **Derived state is disposable.** Caches, indexes, database rows, and in-memory projections must be rebuildable from canonical files or state.
- **Consolidate drift promptly.** When two code paths perform the same semantic operation, refactor toward a shared abstraction before adding more behavior on top.
- **Document intentional duplication.** If temporary duplication is unavoidable, keep it narrow and add a short comment or note explaining the missing shared API and the intended consolidation path.

## Test Style

- Framework: Vitest
- Tests live in `tests/` alongside `src/` in each package
- Descriptive test names: `describe("DiceEvaluator") > it("evaluates 2d20kh1 keeping the highest roll")`
- Use the injectable RNG for all dice tests — never assert on random output

## Review Expectations

- Call out new abstractions, boundary changes, and any duplicate logic in PR descriptions or handoff notes.
- Treat reimplementation of existing behavior as a review concern, even when the duplicate works.
- When shared behavior changes, update nearby docs and tests so future agents can find and trust the canonical path.
- Prefer small refactors that remove redundant code over adding another special-case path.

## Codex Note

This repo may receive independent commits from a local Codex session. If you find changes in spec-sensitive packages that don't correspond to a delegated task, flag them in your response rather than silently building on them.

## NixOS Runtime Requirements

This repository provides a `shell.nix` with the runtime and development tools needed for local work. On NixOS systems, if a required command such as `node`, `pnpm`, `git`, or `pandoc` is missing from the ambient environment, run the command through the project shell with `nix-shell --run '<command>'`.

## Dependency Direction

`apps/*` and `@claros/editor-core` consume `@claros/story-state`; they are Silas-owned parallel work and autonomous agent PRs must not extend or modify them.

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

`@claros/story-state` is the stable workspace API boundary for agent work. `apps/*` and `@claros/editor-core` are consumers only, not extension points for agent PRs.
