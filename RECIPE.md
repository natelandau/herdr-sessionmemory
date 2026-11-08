# Session Memory

A Vault button in the tab bar and a Vault page in the side panel that show the sessionmemory vault of the active project. The person reads each page as rendered markdown, edits it in place, and creates or deletes pages, all through the `sessionmemory` CLI and the files it manages. In a project that is not in the vault, nothing of the mod shows.

## What you see

The mod has two places in the layout and two dialogs. It uses theme colors only, so it follows light and dark themes.

### The button

The button sits in a 78 px block to the right of the shipped `tabs` mod, in the same 42 px top bar. The block has the `chrome` background and a 1 px `border` line at the bottom, like the tab bar.

The button matches the shipped Files and Changes buttons: 26 px high, 8 px side padding, 5 px gap, 6 px corners, 12 px text, and a 14 px book icon (`vault.svg`) before the label "Vault". It uses `muted` text on `chrome`, `hover` on hover, and `selected` with `foreground` text while the Vault panel is open.

### The panel

The panel is a child of the `panel-body` stack, beside Files and Changes. From top to bottom:

1. A header, 42 px high: the book icon, "Vault" in semibold, the project name in `dim` at 12 px, a green (`done`) "Saved" for 2 seconds after a save, and a **+ New** button.
2. A row of section tabs, 24 px high each: Backlog, Reference, Learnings, Runbooks, Specs, Plans, Logs, in that order. Only sections with at least one page show. Each tab except Backlog shows its page count in `dim` at 11 px. The selected tab has the `selected` background.
3. An optional bar in `raised` for unsaved changes ("You have unsaved changes." with Save, Discard, Cancel) or for a conflict ("Changed on disk since you opened it." with Reload, Overwrite, Keep editing).
4. The body. When the panel is 560 px wide or more, the page list (240 px) and the page sit side by side. When it is narrower, the list shows until the person picks a page, then the page shows with a back arrow.

A page list row shows the page title, and under it, in `dim` at 11 px, the date for specs, plans, runbooks, and logs, or the summary for learnings and reference docs. A page with unsaved edits has a 6 px `blocked` dot. A folder shows as a row with a chevron.

The page shows a 38 px toolbar: the title, an "Unsaved" mark in `blocked`, a View and Edit switch, a **Save** button in `solid` while editing, and **Delete** in `dim` (not on the backlog). Below the toolbar, View mode shows the frontmatter title at 20 px semibold, the summary in `muted` italic, and the body rendered as markdown. Edit mode shows the whole file in an editor with line numbers, soft wrap, and the terminal font at 13 px.

### The dialogs

**New page** (440 x 400): a row of kind chips (Learning, Spec, Plan, Runbook, Reference, Backlog item), then the fields for that kind, an error line in `blocked`, and Cancel and Create buttons. A backlog item adds chips for its kind (feat, fix, refactor, perf, docs, test, build, ci, and "Open question" for `decide`) and its size (S, M, L).

**Delete page** (380 x 170): `Delete "TITLE"?`, "This deletes the page permanently.", and Cancel and Delete buttons.

## How it behaves

The mod follows the folder of the focused terminal in the active space, or the space folder when no terminal has focus. It runs `sessionmemory path --json -C FOLDER` and caches the result per folder.

- A folder with no project, or a space on another machine, hides the button block and, if the Vault panel is open, the side panel.
- Every 30 seconds, if the active folder is in no project, the button asks again, so a project registered while Herdr runs gets its button.
- The mod adds `"sessionmemory"` to the shared `workspace.panels` list. The shipped tab bar then remembers, per space, that the Vault panel was open, and opens it again when the person comes back to that space.

### Clicks and keys

| Action | Result |
| --- | --- |
| Click **Vault** | Opens the side panel on the Vault page, or closes it if the Vault page shows. |
| Click a section tab | Shows that section. Backlog opens `backlog.md` directly. |
| Click a page | Opens the page in View mode. |
| Click a folder row | Opens or closes the folder. |
| Click **Edit** | Shows the editor. |
| Click **View** | Shows the rendered page. With unsaved edits, the unsaved-changes bar shows first. |
| Click **Save**, or press Cmd-S or Ctrl-S in the editor | Writes the file. |
| Click **Delete** | Opens the Delete page dialog. |
| Click **+ New** | Opens the New page dialog with the current section's kind selected. |
| Press Enter in a New page field | Same as Create. |

### Saving

Save sets the frontmatter `updated` value to the current UTC time, as `'YYYY-MM-DDTHH:MM:SSZ'`, if the file has frontmatter with an `updated` key. A file without frontmatter is written as it is. The write uses `writeTextFile(path, text, expected)`, where `expected` is the text that the edit started from. If the file on disk differs, the write fails and the conflict bar shows:

- **Reload** discards the edit and loads the file from disk.
- **Overwrite** writes the edit over the current file.
- **Keep editing** hides the bar.

If the write fails but the file on disk is unchanged (a permission error or a full disk), the header shows "Save failed" with the reason, and the edit stays. After a save, the mod runs `sessionmemory reindex -C FOLDER` in the background. FOLDER is the folder that the project was found from.

### Drafts

Each edit is kept in memory as a draft for its file, with the text it started from. When something outside the panel takes the page away (a space switch, a terminal in another project, Files, Changes, a layout switch), nothing is written. The panel remembers the section, page, and mode for each project. When the person comes back, the page opens in Edit mode with the draft and the "Unsaved" mark. Drafts last until Herdr quits.

Inside the panel, picking another page or section, or switching to View, with unsaved edits shows the unsaved-changes bar. Save continues only if the write succeeds. Discard drops the draft.

### Live updates

While a project shows, the panel watches the vault folder of the project with `watchFolder`. When a page changes, the panel lists the sections again and reloads the open page, unless the page has unsaved edits. Only changed pages are read again. Changes made while the panel is hidden apply when it shows again. If the watch fails, the panel looks again every 15 seconds.

### New and Delete

Create runs `sessionmemory new KIND -C FOLDER --json` with `--title`, plus `--summary` for a learning and `--kind`, `--size`, and an optional `--topic` for a backlog item. A learning without a summary, or any page without a title, shows an error and runs nothing. When the CLI fails, its first lines of output show in the dialog. When it succeeds, the dialog closes and the panel opens the new page in Edit mode, or the backlog in View mode.

Delete runs `sessionmemory delete PATH --json`. Logs cannot be created, and the backlog cannot be deleted.

## Built from

One mod folder, `mods/sessionmemory/`, with `mod.json` `{ "place": "none", "title": "Vault" }`. `main.js` exports one `View` and picks a role from `props().role`:

| Role | File | Where |
| --- | --- | --- |
| `button` | `button.js` | Layout block `sessionmemory-button` |
| `panel` | `panel.js` | Layout block `sessionmemory`, a child of the `panel-body` stack |
| `new` | `dialogs.js` | `openOverlay` dialog, props `{ root, project, section }` |
| `confirm` | `dialogs.js` | `openOverlay` dialog, props `{ path, title, root, project }` |

Other files:

- `vault.js`: project lookup and its cache, section listing with `fs/promises.readdir` and `readTextFile`, and the panel commands (`layout.select`, `layout.show`, `layout.hide`).
- `lib.js`: pure helpers with no Herdr imports: the section and kind tables, the frontmatter reader, `bumpUpdated`, page sorting, and the CLI arguments. `test/lib.test.mjs` covers them with `node --test`.
- `ui.js`: the chip and button shared by the panel and the dialogs.
- `vault.svg`: the book icon.
- `scripts/install.sh`: copies the mod into the Herdr home and runs `herdr-app check`.

The dialogs report to the panel through `setShared("sessionmemory.open", {...})` with a unique `nonce`. The panel acts on each `nonce` once.

The layout needs these nodes: a `top-bar` row that holds the `tabs` block and the `sessionmemory-button` block, a `panel` node that the shipped layout hides and shows, the `panel-body` stack, and its `sessionmemory` child.

## Watch out

- Herdr loads a symlinked mod folder but does not reload it when files change, and does not load its SVG assets. Install the mod as a copy.
- A block that is hidden with `layout.hide` stops rendering, but its timers keep running. The button decides show and hide on a 500 ms timer that only compares values, because a hidden copy can never show itself again from `render`.
- A change to the structure of a layout file shows only after the person switches to another layout and back.
- `h_flex` centers its children vertically. Give the page list and the page `h_full()`, or the page collapses to its toolbar.
- `TextView.markdown` needs an explicit `text_color` and `text_size`, or its text is invisible against the panel.
- `sessionmemory reindex -C` takes the project folder, not the vault folder.
- The panel acts on whatever project is active. A test that drives the panel from the shell acts on the project the person has in front, so run such tests only in a throwaway project.
- `writeTextFile` writes only on this computer, so the mod hides itself for remote spaces.

## Done when

- `herdr-app check ~/.config/herdr-app/mods/sessionmemory` passes, and `node --test mods/sessionmemory/test/` passes.
- In a space at a registered project, the Vault button shows to the right of Changes. In a space at your home folder, there is no button and no gap.
- Clicking Vault opens the panel with only the non-empty sections and their counts. No `.sqlite3` file shows in a list.
- A spec opens as rendered markdown with its frontmatter title as the heading.
- Edit, change the same file from a terminal, then Save: the conflict bar shows, and the file on disk keeps the terminal's change.
- Edit, switch to another space and back: the page opens in Edit mode with the edit and the "Unsaved" mark.
- **+ New** creates a page of each kind, including the first page of a section that did not exist, and the section then shows.
- Delete removes a page after the confirmation. The backlog has no Delete.
