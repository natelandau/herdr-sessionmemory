// The Vault button beside the tab bar's Files and Changes. Hides its own block outside vault projects.
import { svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, run } from "herdr";
import { context, resolve, cached, isOpen, isExpanded, collapse, togglePanel, ensurePanelListed, unlistPanel, buttonBlock, BUTTON } from "./vault.js";

export class Button {
  init(cx) {
    ensurePanelListed();
    this.folder = undefined;
    // A hidden block's copy stops rendering but keeps its timers, so showing the
    // block again has to be decided here. Only cheap comparisons run per tick.
    cx.timer.every(500, cx => this.sync(cx));
    // Picks up a project registered after Herdr started.
    cx.timer.every(30000, cx => { if (cached(context().folder) === null) this.check(cx, true); });
    this.sync(cx);
  }

  check(cx, fresh = false) {
    const { folder, on } = context();
    this.folder = folder;
    const before = this.registered();
    cx.spawn(async cx => {
      await resolve(folder, on, { fresh });
      this.sync(cx);
      if (this.registered() !== before) cx.notify();
    });
  }

  registered() {
    const { folder, on } = context();
    return !on && Boolean(cached(folder));
  }

  sync(cx) {
    // Whatever closed or switched the panel (Files, Changes, another space), never leave the terminals hidden.
    if (isExpanded() && !isOpen()) collapse();
    const { folder, on } = context();
    if (folder !== this.folder) { this.check(cx); return; }
    // Remote and folderless spaces are never looked up, so nothing is cached for them.
    if (!on && folder && cached(folder) === undefined) return;
    const block = buttonBlock(), want = this.registered();
    if (block && Boolean(block.hidden) === want) run(want ? "layout.show" : "layout.hide", { id: BUTTON });
  }

  close() {
    unlistPanel();
  }

  render() {
    if (!this.registered()) return h_flex().id("sm-button-root").size_full();
    const t = theme(), open = isOpen();
    return h_flex().id("sm-button-root").size_full().items_center().pr(10).bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("sm-button").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(open ? t.selected : t.chrome).text_color(open ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => togglePanel())
        .child(svg("mods/sessionmemory/vault.svg").size(14)).child("Vault"));
  }
}
