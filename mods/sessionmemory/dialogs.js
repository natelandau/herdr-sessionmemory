// The New page and Delete page dialogs. They run the sessionmemory CLI and report back to the
// panel through shared("sessionmemory.open").
import { div } from "gpui-kit";
import { v_flex, h_flex, Input, InputState } from "gpui-base";
import { props, closeOverlay, theme, exec, setShared } from "herdr";
import { NEW_KINDS, BACKLOG_KINDS, SIZES, newArgs } from "./lib.js";
import { chip, button } from "./ui.js";

function report(msg) {
  setShared("sessionmemory.open", { ...msg, nonce: `${Date.now()}-${Math.random()}` });
}

// Runs `sessionmemory ARGS` once at a time for a dialog; `done(stdout)` runs on success.
function runCli(dialog, args, cx, done) {
  if (dialog.busy) return;
  dialog.busy = true; dialog.error = null;
  cx.spawn(async cx => {
    try {
      const r = await exec("sessionmemory", args);
      if (r.code === 0) done(r.stdout);
      else dialog.error = (r.stderr || r.stdout || "").trim().split("\n").slice(0, 3).join(" ") || `sessionmemory exited ${r.code}`;
    } catch (e) {
      dialog.error = `Could not run sessionmemory: ${e?.message ?? e}`;
    } finally {
      dialog.busy = false;
      cx.notify();
    }
  });
}

function footer(t, dialog, id, label, busyLabel, onClick) {
  return [
    dialog.error ? div().text_size(12).text_color(t.blocked).child(dialog.error) : null,
    div().flex_1(),
    h_flex().justify_end().gap(8)
      .child(button(t, "sm-cancel", "Cancel", false, () => closeOverlay(props().overlay)))
      .child(button(t, id, dialog.busy ? busyLabel : label, true, onClick)),
  ].filter(Boolean);
}

function chipRow(t, prefix, options, current, set) {
  return h_flex().gap(4).flex_wrap().children(options.map(o =>
    chip(t, `${prefix}-${o.value}`, o.value === current, (_e, cx) => { set(o.value); cx.notify(); }).child(o.label)));
}

const SIZE_OPTIONS = SIZES.map(s => ({ value: s, label: s }));

export class NewDialog {
  init() {
    this.kind = NEW_KINDS.find(k => k.section === props().section)?.value ?? "spec";
    this.backlogKind = "feat";
    this.size = "S";
    this.inputs = {
      title: InputState.new({ placeholder: "Title" }),
      summary: InputState.new({ placeholder: "One sentence a search result shows" }),
      topic: InputState.new({ placeholder: "Topic tag (optional)" }),
    };
    for (const input of Object.values(this.inputs)) input.on("submit", (_e, cx) => this.create(cx));
    this.inputs.title.focus();
    this.error = null;
    this.busy = false;
  }

  fields() {
    return NEW_KINDS.find(k => k.value === this.kind).fields;
  }

  create(cx) {
    const p = props(), title = this.inputs.title.value().trim(), summary = this.inputs.summary.value().trim();
    if (!title) { this.error = "A title is required."; cx.notify(); return; }
    if (this.fields().includes("summary") && !summary) { this.error = "A learning needs a summary."; cx.notify(); return; }
    const values = { title, summary, kind: this.backlogKind, size: this.size, topic: this.inputs.topic.value() };
    const kind = NEW_KINDS.find(k => k.value === this.kind);
    runCli(this, newArgs(this.kind, values, p.root), cx, stdout => {
      let path = null;
      try { path = JSON.parse(stdout).path ?? null; } catch { path = null; }
      report({ project: p.project, section: kind.section, path, mode: kind.value === "backlog" ? "view" : "edit" });
      closeOverlay(p.overlay);
    });
  }

  render() {
    const t = theme(), fields = this.fields();
    const label = text => div().text_size(11).text_color(t.dim).child(text);
    const field = name => Input.new(this.inputs[name]).h(30).px(8).rounded(6).border_1().border_color(t.input).bg(t.background).text_size(13);
    return v_flex().id("sm-new-dialog").size_full().p(18).gap(10).bg(t.popover).text_color(t.foreground).text_size(13)
      .child(div().text_size(15).font_semibold().child("New page"))
      .child(chipRow(t, "sm-kind", NEW_KINDS, this.kind, v => { this.kind = v; this.error = null; }))
      .when(fields.includes("kind"), el => el
        .child(label("Kind"))
        .child(chipRow(t, "sm-bk", BACKLOG_KINDS, this.backlogKind, v => { this.backlogKind = v; }))
        .child(label("Size"))
        .child(chipRow(t, "sm-size", SIZE_OPTIONS, this.size, v => { this.size = v; })))
      .child(field("title"))
      .when(fields.includes("summary"), el => el.child(field("summary")))
      .when(fields.includes("topic"), el => el.child(field("topic")))
      .children(footer(t, this, "sm-create", "Create", "Creating…", (_e, cx) => this.create(cx)));
  }

  close() {
    for (const input of Object.values(this.inputs ?? {})) input.release();
  }
}

export class ConfirmDialog {
  init(cx) {
    this.error = null;
    this.busy = false;
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  remove(cx) {
    const p = props();
    runCli(this, ["delete", p.path, "--json"], cx, () => {
      report({ project: p.project, deleted: p.path });
      closeOverlay(p.overlay);
    });
  }

  render() {
    const t = theme(), p = props();
    return v_flex().id("sm-confirm").size_full().p(18).gap(10).bg(t.popover).text_color(t.foreground).text_size(13)
      .track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "enter") { this.remove(cx); cx.stop_propagation(); } })
      .child(div().text_size(15).font_semibold().truncate().child(`Delete "${p.title}"?`))
      .child(div().text_color(t.muted).child("This deletes the page permanently."))
      .children(footer(t, this, "sm-delete", "Delete", "Deleting…", (_e, cx) => this.remove(cx)));
  }
}
