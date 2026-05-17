# Claros Editor User Manual

This is the living user manual for the Claros editor. It should describe the editor as it exists today, not as it is planned to exist later.

## Current Editor Scope

The current editor is an early web-based writing surface for a single Markdown draft.

It is meant to prove the core writing experience:

- Prose-first Markdown editing
- Minimal visible UI
- Optional Vim-style editing
- A command palette shell
- Browser-local draft persistence

It does not yet provide full Claros project management, file browsing, wikilink resolution, emergence/oracle execution, export, or desktop integration.

## Writing Surface

The main screen is the editor.

The editor stores text as Markdown, but it is styled to feel like a prose writing environment rather than a code editor:

- No line numbers
- No code gutters
- No minimap
- Proportional prose font by default
- Centered manuscript-style writing column
- Quiet Markdown syntax markers when the cursor is away from a line
- Book-like heading presentation for chapter and scene headings
- Inline italic and bold presentation for emphasized Markdown text

Markdown remains directly editable. When the cursor is on a line, the underlying Markdown syntax is visible enough to edit predictably.

Headings use conventional prose presentation:

- `#` headings are centered chapter-style headings
- `##` headings are centered scene-style headings
- Lower heading levels are quieter section headings

Emphasis and strong emphasis are rendered inline as italic and bold text while preserving the underlying Markdown.

## Draft Persistence

The editor currently works with one browser-local draft.

Changes are saved automatically to the browser's `localStorage`. Reloading the page restores the same draft in the same browser profile.

This is temporary. Later Claros versions will replace this with real project and file persistence.

## Top Bar

The top bar contains:

- `Claros` and `Draft`, identifying the current single-draft workspace
- `Focus`
- `Vim`
- `Commands`

The top bar is intentionally quiet and becomes more visible when hovered or focused.

## Focus

`Focus` moves keyboard focus back into the editor.

Use it after clicking the top bar or command palette if you want to return immediately to writing.

`Focus` does not yet enable a special distraction-free mode. It is currently just a focus-return command.

## Vim Mode

`Vim` toggles Vim-style editing.

When Vim mode is enabled, the editor uses the Vim keybinding layer provided by `@replit/codemirror-vim`. This includes standard Vim-like normal and insert mode behavior, such as movement, insertion, deletion, search, and mode switching.

Claros does not yet define custom Vim mappings or Claros-specific Vim commands.

## Command Palette

`Commands` opens the command palette shell.

The command palette currently contains:

- Enable or disable Vim mode
- Theme commands for Default, Gruvbox, Solarized, Everforest, and Catppuccin light/dark variants
- Return to Draft

The command palette filters as you type. Theme changes are saved in the browser and restored when you reload the editor.

Use `ArrowUp` and `ArrowDown` to move through command results, then press `Enter` to run the selected command.

The command palette is intentionally minimal in this first iteration. Future versions will add editor, navigation, project, wikilink, and emergence commands.

## Keyboard Shortcuts

Current shortcuts:

| Shortcut                       | Action                                           |
| ------------------------------ | ------------------------------------------------ |
| `Ctrl+K` / `Cmd+K`             | Open or close the command palette                |
| `Ctrl+Shift+V` / `Cmd+Shift+V` | Toggle Vim mode                                  |
| `Escape`                       | Close the command palette and refocus the editor |

Vim mode adds Vim-style keybindings while it is enabled.

## Not Yet Implemented

The current editor does not yet include:

- Project folders
- File tree or tabs
- Open/save dialogs
- Desktop filesystem access
- Wikilink resolution
- Backlinks
- Entity autocomplete
- Emergence blocks
- Dice or oracle execution
- Inline slash commands
- Export

## Design Direction

The editor should continue to feel like a tool for writers, not programmers.

Implementation details such as CodeMirror should remain invisible in the default experience. The user should primarily experience a calm prose surface, with Markdown and Claros-specific tools available when needed but not visually dominant.
