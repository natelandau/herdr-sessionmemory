// Session Memory: the active project's sessionmemory vault in Herdr. One mod, one role per copy:
// props().role is "button" (beside the tab bar), "panel" (the side panel), "new" or "confirm" (dialogs).
import { View, div } from "gpui-kit";
import { props } from "herdr";
import { Button } from "./button.js";
import { Panel } from "./panel.js";
import { NewDialog, ConfirmDialog } from "./dialogs.js";

const ROLES = { button: Button, panel: Panel, new: NewDialog, confirm: ConfirmDialog };

export default class SessionMemory extends View {
  init(_props, cx) {
    const Role = ROLES[props()?.role];
    this.role = Role ? new Role() : null;
    this.role?.init(cx);
  }
  render(cx) {
    return this.role ? this.role.render(cx) : div();
  }
  async close(cx) {
    await this.role?.close?.(cx);
  }
}
