# Claros Editor User Manual

This is the living user manual for the Claros editor. It should describe the editor as it exists today, not as it is planned to exist later.

## Current Editor Scope

The current editor is an early web-based writing surface for a local Claros project folder.

It is meant to prove the core writing experience:

- Prose-first Markdown editing
- Minimal visible UI
- Optional Vim-style editing
- A command palette shell
- Browser-mediated local project persistence
- Project header and collapsible sidebar navigation

It does not yet provide emergence/oracle execution, export, or desktop integration.

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

Outside Vim mode, `Enter` starts a new paragraph by inserting the blank line required by
Markdown. Use `Shift+Enter` for a single continued line, including when continuing blockquotes,
lists, or indented text. On an empty line, `Enter` inserts a single line break.

## Project Persistence

The editor opens a local Claros project folder using the browser File System Access API when the browser provides it.

On the start screen, choose a storage backend from the left side of the project launcher, then use `Open Project` or the `+` segment for `New Project`.

The Local Folder backend chooses a folder containing `claros.yaml` and `manuscript/`. The editor builds its sidebar from the actual project files and saves Markdown edits back to those files.

Firefox and other browsers without writable directory picker support can use the Claros local files companion. Run `pnpm --filter @claros/local-companion start -- /path/to/project`, then choose Local Companion in the start-screen launcher or open the URL printed by the companion.

`New Project` initializes a selected folder or companion-served folder with a minimal Claros project. Unsupported backends are shown as unavailable in the launcher.

The web editor does not persist recent project handles yet, so you may need to reopen or reconnect after reloading.

## Top Bar

The top bar contains:

- The project title and active document title
- The active document kind and save state
- `Commands`

The top bar is intentionally quiet and becomes more visible when hovered or focused.

## Focus

`Focus Editor` moves keyboard focus back into the editor from the command palette.

Use it after clicking the top bar or command palette if you want to return immediately to writing.

`Focus Editor` does not yet enable a special distraction-free mode. It is currently just a focus-return command.

## Vim Mode

`Enable Vim` and `Disable Vim` toggle Vim-style editing from the command palette.

When Vim mode is enabled, the editor uses the Vim keybinding layer provided by `@replit/codemirror-vim`. This includes standard Vim-like normal and insert mode behavior, such as movement, insertion, deletion, search, and mode switching.

Claros does not yet define custom Vim mappings or Claros-specific Vim commands.

## Sidebar

The left sidebar is collapsed by default. A small vertical `Project` tab remains visible at the left edge of the screen.

Open or close the sidebar with the tab or with `Ctrl+B` / `Cmd+B`.

The sidebar contains two sections:

- `Manuscript`, with chapters in sequence order and scenes nested under their chapters
- `Notes`, with note folders and notes

The `Notes` section starts collapsed for a cleaner writing view. Sections, chapters, and note folders can be expanded or collapsed.

Chapters and scenes use their configured titles when available. Untitled chapters and scenes use sequence labels such as `Chapter 2` or `Scene 2`.

On desktop, the sidebar reserves space beside the manuscript while open. On narrow screens, it overlays the editor.

Opening a scene or note from the sidebar keeps keyboard focus in the sidebar so you can browse documents quickly. Use `Ctrl+Right` / `Cmd+Right` to return focus to the editor while leaving the sidebar open.

## Command Palette

`Commands` opens the command palette shell.

The command palette currently contains:

- Enable or disable Vim mode
- Toggle the sidebar
- Open Project: Local Folder
- New Project: Local Folder
- Open Project: Local Companion
- New Project: Local Companion
- Save the current document
- Theme commands for Default, Gruvbox, Solarized, Everforest, and Catppuccin light/dark variants
- Focus Editor

The command palette filters as you type. Running a command closes the palette. Theme changes are saved in the browser and restored when you reload the editor.

Use `ArrowUp` and `ArrowDown` to move through command results, then press `Enter` to run the selected command.

The command palette is intentionally minimal in this first iteration. Future versions will add editor, navigation, project, wikilink, and emergence commands.

## Keyboard Shortcuts

Current shortcuts:

| Shortcut                       | Action                                  |
| ------------------------------ | --------------------------------------- |
| `Ctrl+K` / `Cmd+K`             | Open or close the command palette       |
| `Ctrl+B` / `Cmd+B`             | Open or close the project sidebar       |
| `Ctrl+Left` / `Cmd+Left`       | Move focus to the project sidebar       |
| `Ctrl+Right` / `Cmd+Right`     | Move focus to the editor                |
| `Ctrl+Shift+V` / `Cmd+Shift+V` | Toggle Vim mode                         |
| `Escape`                       | Close the command palette or sidebar    |
| `ArrowUp` / `ArrowDown`        | Move through visible sidebar items      |
| `ArrowLeft`                    | Collapse the selected sidebar branch    |
| `ArrowRight`                   | Expand the selected sidebar branch      |
| `Enter`                        | Open the selected sidebar document      |
| `M`                            | Jump to manuscript items in the sidebar |
| `N`                            | Jump to note items in the sidebar       |

Vim mode adds Vim-style keybindings while it is enabled.

## Not Yet Implemented

The current editor does not yet include:

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
