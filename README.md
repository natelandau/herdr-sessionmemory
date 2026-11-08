# Session Memory for Herdr

Session Memory is a mod for the [Herdr](https://herdr.dev) app. It shows the [sessionmemory](https://github.com/natelandau/sessionmemory) vault of the project you work in, in Herdr's side panel. You can read, edit, create, and delete the backlog, reference docs, learnings, runbooks, specs, plans, and session logs of the project without leaving the window.

## Features

The mod adds a **Vault** button to the right of Herdr's **Files** and **Changes** buttons. The button opens and closes the Vault panel.

- The button shows only in a space whose project is registered in the vault. In other spaces, the button and its space are hidden.
- The panel shows one tab per section that has pages: Backlog, Reference, Learnings, Runbooks, Specs, Plans, and Logs. Each tab shows its page count.
- The page list shows the title of each page, with its date or summary. Specs, plans, and logs show the newest first. Folders inside a section open in place.
- A page opens as rendered markdown. **Edit** shows the full file, frontmatter included, in an editor with line numbers.
- **Save** (or Cmd-S or Ctrl-S) writes the file and sets its `updated` date. If an agent changed the file after you opened it, the panel does not overwrite the change. It asks you to reload, overwrite, or keep editing.
- Unsaved edits stay in memory when you switch spaces. When you come back, the panel opens the same page with your edit, marked **Unsaved**.
- **Expand** in the panel header hides the terminals and gives the Vault the whole work area. **Restore** brings the terminals back at the panel's earlier width. The terminals keep running while they are hidden.
- **A−** and **A+** in the panel header make the panel's text smaller or larger, from 80% to 200%. The size applies to the page, the editor, the list, and the dialogs, and it is kept after a restart. To scale all of Herdr, terminals included, use Herdr's zoom instead (Cmd-+ and Cmd--).
- **+ New** creates a learning, spec, plan, runbook, reference doc, or backlog item with `sessionmemory new`. **Delete** removes a page with `sessionmemory delete` after you confirm.

## Requirements

The mod needs these programs on the machine that runs Herdr:

- The Herdr app.
- The `sessionmemory` CLI, on the `PATH` of your login shell.
- A project registered with `sessionmemory project register`.

The mod works only with spaces on this computer. A space on another machine shows no button.

## Install

The install has two parts: copy the mod, then add it to a layout that you own.

1. Clone this repository and copy the mod into your Herdr home:

    ```sh
    git clone https://github.com/natelandau/herdr-sessionmemory.git
    cd herdr-sessionmemory
    ./scripts/install.sh
    ```

    The script copies `mods/sessionmemory` to `~/.config/herdr-app/mods/sessionmemory` and runs `herdr-app check` on the copy. Herdr does not reload or load icons from a symlinked mod folder, so the script copies the files.

2. Open a layout that you own in `~/.config/herdr-app/layouts/`. Herdr's shipped layouts are read-only. If you use a shipped layout, clone it first:

    ```sh
    herdr-app do layout.clone '{"name":"main","as":"my-layout"}'
    ```

3. In the layout file, find the block that shows the `tabs` mod. Replace that block with a row that holds the `tabs` block and the Vault button:

    ```json
    {
      "id": "top-bar", "type": "row", "size": { "px": 42 }, "resizable": false,
      "children": [
        { "id": "tabs", "type": "block", "size": { "weight": 1 }, "window_drag": true, "content": { "mod": "tabs" } },
        { "id": "sessionmemory-button", "type": "block", "size": { "px": 78 }, "window_drag": true,
          "background": "chrome", "content": { "mod": "sessionmemory", "props": { "role": "button" } } }
      ]
    }
    ```

    Keep the height of your original `tabs` block. The `main` layout uses 42 px.

4. In the same file, find the stack with the id `panel-body`. Add the Vault panel after the `files` and `changes` blocks:

    ```json
    { "id": "sessionmemory", "type": "block", "content": { "mod": "sessionmemory", "props": { "role": "panel" } } }
    ```

    The ids `sessionmemory-button`, `main`, `panel`, `panel-body`, and `sessionmemory` must stay as shown. The mod uses them to show and hide its button, the panel, and the terminals.

    To let the panel grow past the shipped 900 px limit, set `"max"` on the `panel` node to a large number, such as `10000`. Without it, **Expand** stops at 900 px.

5. Switch to another layout and back, so that Herdr reads the new structure. Press Ctrl-Shift-L twice, or run `herdr-app do layout.switch --name my-layout`.

To remove the mod, undo the two layout edits and delete `~/.config/herdr-app/mods/sessionmemory`.

## Update

Pull the repository, then run the install script again:

```sh
git pull
./scripts/install.sh
```

Herdr reloads the mod when its files change. You do not need to restart the app.

## How the panel finds the project

The panel uses the folder of the focused terminal in the active space. If no terminal has focus, it uses the folder of the space. It runs `sessionmemory path --json -C FOLDER`, which also finds the project from a subfolder or a git worktree. The panel shows nothing when the command finds no project.

A project that you register while Herdr runs gets its button within 30 seconds.

## Development

The pure helpers in `mods/sessionmemory/lib.js` have tests that run in Node:

```sh
node --test mods/sessionmemory/test/
```

After a change, run `./scripts/install.sh` to copy the mod and run `herdr-app check`.

## More detail

[RECIPE.md](RECIPE.md) describes every region, click, and state of the mod, and how it is built.

## License

[MIT](LICENSE)
