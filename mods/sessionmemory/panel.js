// The Vault page in the side panel: sections, a file list, and each page rendered or edited.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, TextView, Editor, EditorState } from "gpui-base";
import { theme, settings, readTextFile, writeTextFile, watchFolder, exec, run, shared, openOverlay } from "herdr";
import { parsePage, pageTitle, bumpUpdated, isoNow } from "./lib.js";
import { context, resolve, cached, listSections, forget, isOpen, openPanel, PANEL } from "./vault.js";
import { chip, button } from "./ui.js";

const WIDE = 560;

// Async work captures `this.paths` (the project) or `this.page` (the open page) before it
// awaits, and drops its result when that object was replaced meanwhile.
export class Panel {
  init(cx) {
    this.key = undefined;      // "machine:folder" the panel last followed
    this.paths = null;         // sessionmemory path --json for the shown project
    this.root = null;          // the folder `paths` was resolved from; the CLI's -C needs it
    this.sections = [];
    this.section = null;       // section key
    this.page = null;          // { path, text, parsed, editor, mode, conflict }
    this.places = new Map();   // project dir -> { section, file, mode }
    this.drafts = new Map();   // page path -> { text, snapshot }
    this.expanded = new Set(); // "project/section/rel" of open subfolders
    this.width = 800;
    this.ask = null;           // what to run once the person settles unsaved edits
    this.flash = null;
    this.stale = false;        // the vault changed since the last listing
    this.handle = cx.focus_handle();
    this.seen = shared("sessionmemory.open")?.nonce ?? null;
  }

  // ---- project ------------------------------------------------------------

  follow(cx) {
    // Whether the folder is known to be in a project is part of the key, so a project
    // registered later (found by the button's re-check) is entered without a folder change.
    const { folder, on } = context(), key = `${on ?? ""}:${folder ?? ""}:${Boolean(cached(folder))}`;
    if (key === this.key) return;
    this.key = key;
    this.remember();
    cx.spawn(async cx => {
      const paths = await resolve(folder, on);
      if (this.key !== key) return;
      if (!paths) {
        this.leave();
        if (isOpen()) run("layout.hide", { id: PANEL });
      } else if (paths.project !== this.paths?.project) {
        await this.enter(paths, folder, cx);
      } else {
        this.root = folder;
      }
      cx.notify();
    });
  }

  remember() {
    // A project still being entered has no section yet and must not overwrite its saved place.
    if (this.paths && this.section) this.places.set(this.paths.project, { section: this.section, file: this.page?.path ?? null, mode: this.page?.mode ?? "view" });
  }

  leave() {
    this.setPage(null);
    this.paths = null; this.root = null; this.sections = []; this.section = null; this.ask = null;
    this.watching = null; this.stale = false;
    this.fallback?.cancel(); this.fallback = null;
  }

  async enter(paths, folder, cx) {
    this.leave();
    this.paths = paths; this.root = folder;
    // Pages may have changed while another project was shown and nothing watched this one.
    forget([paths.project]);
    if (!await this.reload()) return;
    const place = this.places.get(paths.project);
    const keep = place && this.sections.some(s => s.key === place.section);
    if (keep) this.section = place.section;
    const file = keep ? place.file : this.current()?.file ?? null;
    if (file) await this.load(file, keep ? place.mode : "view");
    if (this.paths === paths) this.watch(cx);
  }

  // Lists the sections again; false when the project changed meanwhile.
  async reload() {
    const paths = this.paths;
    if (!paths) return false;
    const sections = await listSections(paths);
    if (this.paths !== paths) return false;
    this.sections = sections;
    if (!this.current()) this.section = sections[0]?.key ?? null;
    return true;
  }

  current() {
    return this.sections.find(s => s.key === this.section) ?? null;
  }

  // Watching only marks the listing stale; render refreshes it, and a hidden copy never renders.
  watch(cx) {
    const root = this.paths.project, token = this.watching = { root };
    const stale = (changed, cx) => { forget(changed); this.stale = true; cx.notify(); };
    // A folder event (no extension: a renamed or removed subfolder, or the root) can move pages.
    const relevant = p => p.endsWith(".md") || !p.split("/").pop().includes(".");
    cx.spawn(async cx => {
      try {
        while (this.watching === token) {
          const changed = await watchFolder(root);
          // Index files change on every reindex; only pages and folders of pages matter.
          if (this.watching === token && changed.some(relevant)) stale(changed, cx);
        }
      } catch (e) {
        if (this.watching !== token) return;
        console.log(`sessionmemory: watching ${root} failed, polling instead: ${e?.message ?? e}`);
        this.fallback = cx.timer.every(15000, cx => { if (this.watching === token) stale([root], cx); });
      }
    });
  }

  refreshIfStale(cx) {
    if (!this.stale || this.refreshing || !this.paths) return;
    this.stale = false; this.refreshing = true;
    cx.spawn(async cx => {
      try { if (await this.reload()) await this.syncPage(false); }
      finally { this.refreshing = false; cx.notify(); }
    });
  }

  // ---- the open page --------------------------------------------------------

  setPage(page) {
    this.page?.editor?.release();
    this.page = page;
  }

  // Reads the open page from disk. Without `force`, keeps unsaved edits and skips unchanged text.
  async syncPage(force) {
    const pg = this.page;
    if (!pg || (!force && this.dirty())) return;
    const text = await readTextFile(pg.path).catch(() => null);
    if (this.page !== pg) return;
    if (text === null) { this.setPage(null); return; }
    if (!force && text === pg.text) return;
    Object.assign(pg, { text, parsed: parsePage(text) });
    pg.editor?.set_value(text);
  }

  // Opens a page; the last call wins even when an earlier read finishes later.
  async load(path, mode) {
    const token = this.loading = {}, paths = this.paths;
    const text = await readTextFile(path).catch(() => null);
    if (this.loading !== token || this.paths !== paths) return;
    if (text === null) { this.setPage(null); return; }
    this.setPage({ path, text, parsed: parsePage(text), editor: null, mode: this.drafts.has(path) ? "edit" : mode, conflict: false });
    if (this.page.mode === "edit") this.makeEditor();
  }

  makeEditor() {
    const t = theme(), pg = this.page;
    const editor = pg.editor = EditorState.new({
      language: "markdown", value: this.drafts.get(pg.path)?.text ?? pg.text, soft_wrap: true,
      font_family: settings().font_family, font_size: 13,
      syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 },
    });
    editor.on("change", (_e, cx) => {
      if (pg.editor !== editor) return;
      const had = this.drafts.has(pg.path), text = editor.value(), snapshot = this.drafts.get(pg.path)?.snapshot ?? pg.text;
      if (text === snapshot) this.drafts.delete(pg.path); else this.drafts.set(pg.path, { text, snapshot });
      // The editor draws its own text; the panel only shows whether there are unsaved edits.
      if (this.drafts.has(pg.path) !== had) cx.notify();
    });
  }

  toView() {
    const pg = this.page;
    pg.editor?.release();
    Object.assign(pg, { editor: null, mode: "view", conflict: false });
  }

  dirty() {
    return Boolean(this.page && this.drafts.has(this.page.path));
  }

  // Runs `then` now, or after the person settles unsaved edits.
  guard(then, cx) {
    if (!this.dirty()) { then(cx); return; }
    this.ask = then;
    cx.notify();
  }

  open(path, cx) {
    this.guard(cx => cx.spawn(async cx => { await this.load(path, "view"); cx.notify(); }), cx);
  }

  pick(section, cx) {
    this.guard(cx => {
      this.section = section;
      const s = this.current();
      if (s?.file) this.open(s.file, cx);
      else { this.setPage(null); cx.notify(); }
    }, cx);
  }

  setMode(mode, cx) {
    if (!this.page || mode === this.page.mode) return;
    if (mode === "edit") { this.page.mode = "edit"; this.makeEditor(); cx.notify(); return; }
    this.guard(cx => { this.toView(); cx.notify(); }, cx);
  }

  save(cx) {
    cx.spawn(async cx => { await this.write(cx); cx.notify(); });
  }

  // Writes the editor's text if the file still matches what it was based on.
  // `expected` overrides that base: the disk text to overwrite, or null to recreate a deleted file.
  async write(cx, expected) {
    const pg = this.page;
    if (!pg?.editor || this.saving) return false;
    if (expected === undefined && !this.dirty()) return true;
    const raw = pg.editor.value(), folder = this.root;
    const text = parsePage(raw).hasFrontmatter ? bumpUpdated(raw, isoNow(new Date())) : raw;
    const snapshot = expected !== undefined ? expected : this.drafts.get(pg.path)?.snapshot ?? pg.text;
    // Two writes from one snapshot would make the second one look like a conflict.
    this.saving = true;
    try {
      await writeTextFile(pg.path, text, snapshot);
    } catch (e) {
      const disk = await readTextFile(pg.path).catch(() => null);
      if (disk !== snapshot) pg.conflict = true;
      else if (this.page === pg) this.say(`Save failed: ${e?.message ?? e}`, cx);
      return false;
    } finally {
      this.saving = false;
    }
    const typed = pg.editor ? pg.editor.value() : raw;
    // Text typed while the write ran stays a draft against what is now on disk.
    if (typed === raw) this.drafts.delete(pg.path); else this.drafts.set(pg.path, { text: typed, snapshot: text });
    Object.assign(pg, { text, parsed: parsePage(text), conflict: false });
    if (pg.editor && typed === raw && text !== raw) pg.editor.set_value(text);
    if (this.page === pg) this.say("Saved", cx);
    if (folder) {
      exec("sessionmemory", ["reindex", "-C", folder])
        .then(r => { if (r.code !== 0) console.log(`sessionmemory: reindex failed (${r.code}): ${r.stderr.trim()}`); })
        .catch(e => console.log(`sessionmemory: reindex did not start: ${e?.message ?? e}`));
    }
    return true;
  }

  say(text, cx) {
    const flash = this.flash = { text };
    cx.timer.after(2000, cx => { if (this.flash === flash) { this.flash = null; cx.notify(); } });
  }

  settle(choice, cx) {
    const then = this.ask;
    this.ask = null;
    if (choice === "cancel" || !then) { cx.notify(); return; }
    if (choice === "discard") {
      this.drafts.delete(this.page.path);
      this.toView();
      then(cx);
      return;
    }
    // Save first; continue only if the save landed.
    cx.spawn(async cx => { if (await this.write(cx)) then(cx); cx.notify(); });
  }

  resolveConflict(choice, cx) {
    const pg = this.page;
    if (!pg) return;
    pg.conflict = false;
    if (choice === "keep") { cx.notify(); return; }
    cx.spawn(async cx => {
      if (choice === "reload") {
        this.drafts.delete(pg.path);
        await this.syncPage(true);
      } else {
        const disk = await readTextFile(pg.path).catch(() => null);
        if (this.page === pg) await this.write(cx, disk);
      }
      cx.notify();
    });
  }

  // ---- dialogs ------------------------------------------------------------

  newPage() {
    if (!this.paths) return;
    openOverlay({ mod: "sessionmemory", kind: "dialog", modal: true, width: 440, height: 400,
      props: { role: "new", root: this.root, project: this.paths.project, section: this.section } });
  }

  deletePage() {
    const pg = this.page;
    if (!pg || pg.path === this.paths?.backlog) return;
    openOverlay({ mod: "sessionmemory", kind: "dialog", width: 380, height: 170,
      props: { role: "confirm", path: pg.path, title: pageTitle(pg.parsed.meta, pg.path), project: this.paths.project } });
  }

  // Dialogs report through shared state; the panel acts on each report once.
  inbox(cx) {
    const msg = shared("sessionmemory.open");
    if (!msg || msg.nonce === this.seen) return;
    this.seen = msg.nonce;
    if (!this.paths || msg.project !== this.paths.project) return;
    // The dialog's result replaces whatever the prompt was about; any draft stays in `drafts`.
    this.ask = null;
    cx.spawn(async cx => {
      forget([msg.deleted ?? msg.path].filter(Boolean));
      if (!await this.reload()) return;
      if (msg.deleted) {
        this.drafts.delete(msg.deleted);
        if (this.page?.path === msg.deleted) this.setPage(null);
      } else if (msg.path) {
        if (this.sections.some(s => s.key === msg.section)) this.section = msg.section;
        await this.load(msg.path, msg.mode ?? "view");
      }
      if (!isOpen()) openPanel();
      cx.notify();
    });
  }

  // ---- render ---------------------------------------------------------------

  render(cx) {
    this.follow(cx);
    this.inbox(cx);
    this.refreshIfStale(cx);
    const t = theme();
    const root = v_flex().id("sm-panel").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13)
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.width) > 1) { this.width = size.width; cx.notify(); } })
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if ((e.keystroke === "cmd-s" || e.keystroke === "ctrl-s") && this.page?.mode === "edit") { this.save(cx); cx.stop_propagation(); }
      });
    if (!this.paths) return root;
    const wide = this.width >= WIDE, section = this.current(), pg = this.page;
    const showList = section && !section.file && (wide || !pg);
    const showDoc = pg && (wide || !showList || section?.file);
    return root
      .child(this.header(t))
      .child(this.chips(t))
      .when(Boolean(this.ask), el => el.child(this.bar(t, "You have unsaved changes.",
        [["save", "Save"], ["discard", "Discard"], ["cancel", "Cancel"]], (id, cx) => this.settle(id, cx))))
      .when(Boolean(pg?.conflict), el => el.child(this.bar(t, "Changed on disk since you opened it.",
        [["reload", "Reload"], ["overwrite", "Overwrite"], ["keep", "Keep editing"]], (id, cx) => this.resolveConflict(id, cx))))
      .child(h_flex().flex_1().items_start().min_h(0).min_w(0)
        .when(Boolean(showList), el => el.child(this.list(t, section, wide && Boolean(showDoc))))
        .when(Boolean(showDoc), el => el.child(this.document(t, wide, section)))
        .when(!showList && !showDoc, el => el.child(div().p(14).text_color(t.dim).child(this.sections.length ? "Pick a page" : "No pages yet. Use New to add one."))));
  }

  header(t) {
    return h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
      .child(svg("mods/sessionmemory/vault.svg").size(14).text_color(t.muted))
      .child(div().font_semibold().child("Vault"))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(this.paths.project.split("/").pop()))
      .when(Boolean(this.flash), el => el.child(div().text_size(12).text_color(t.done).child(this.flash?.text ?? "")))
      .child(h_flex().id("sm-new").h(26).px(9).gap(5).items_center().rounded(6).text_size(12).text_color(t.muted)
        .hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .on_click(() => this.newPage()).child("+ New"));
  }

  chips(t) {
    return h_flex().flex_none().px(10).py(8).gap(4).border_b(1).border_color(t.border)
      .children(this.sections.map(s => chip(t, `sm-chip-${s.key}`, s.key === this.section, (_e, cx) => this.pick(s.key, cx))
        .child(s.label)
        .when(s.count !== null, el => el.child(div().text_size(11).text_color(t.dim).child(String(s.count))))));
  }

  bar(t, text, actions, onPick) {
    return h_flex().flex_none().px(12).py(6).gap(8).items_center().bg(t.raised).border_b(1).border_color(t.border).text_size(12)
      .child(div().flex_1().min_w(0).text_color(t.foreground).child(text))
      .children(actions.map(([id, label]) => button(t, `sm-bar-${id}`, label, false, (_e, cx) => onPick(id, cx))));
  }

  list(t, section, beside) {
    return v_flex().id("sm-list").h_full().min_h(0).p(6).overflow_y_scrollbar()
      .when(beside, el => el.w(240).flex_none().border_r(1).border_color(t.border))
      .when(!beside, el => el.flex_1())
      .children(this.rows(t, section.key, section.pages, 0, []));
  }

  rows(t, sectionKey, nodes, depth, out) {
    for (const n of nodes) {
      if (n.dir) {
        const id = `${this.paths.project}/${sectionKey}/${n.rel}`, open = this.expanded.has(id);
        out.push(h_flex().id(`sm-dir-${id}`).h(28).flex_none().pl(6 + depth * 14).pr(6).gap(6).items_center().rounded(6)
          .cursor_pointer().hover(s => s.bg(t.hover)).text_color(t.muted)
          .on_click((_e, cx) => { if (open) this.expanded.delete(id); else this.expanded.add(id); cx.notify(); })
          .child(svg(`mods/files/chevron-${open ? "down" : "right"}.svg`).size(12).text_color(t.dim))
          .child(div().flex_1().min_w(0).truncate().child(n.name)));
        if (open) this.rows(t, sectionKey, n.children, depth + 1, out);
        continue;
      }
      const on = n.path === this.page?.path, unsaved = this.drafts.has(n.path);
      out.push(v_flex().id(`sm-page-${n.path}`).flex_none().pl(8 + depth * 14).pr(8).py(5).rounded(6).cursor_pointer()
        .bg(on ? t.selected : t.background).hover(s => s.bg(on ? t.selected : t.hover))
        .on_click((_e, cx) => this.open(n.path, cx))
        .child(h_flex().gap(6).items_center()
          .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(n.title))
          .when(unsaved, el => el.child(div().size(6).rounded(3).bg(t.blocked))))
        .when(Boolean(n.sub), el => el.child(div().truncate().text_size(11).text_color(t.dim).child(n.sub))));
    }
    return out;
  }

  document(t, wide, section) {
    const pg = this.page, { meta, body } = pg.parsed;
    const title = !meta.title && pg.path === this.paths.backlog ? "Backlog" : pageTitle(meta, pg.path);
    const seg = (id, label) => chip(t, `sm-mode-${id}`, pg.mode === id, (_e, cx) => this.setMode(id, cx)).child(label);
    return v_flex().flex_1().h_full().min_w(0).min_h(0)
      .child(h_flex().h(38).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border)
        .when(!wide && !section?.file, el => el.child(div().id("sm-back").w(18).cursor_pointer().text_color(t.muted)
          .on_click((_e, cx) => this.guard(cx => { this.setPage(null); cx.notify(); }, cx)).child("←")))
        .child(div().flex_1().min_w(0).truncate().font_semibold().child(title))
        .when(this.dirty(), el => el.child(div().text_size(11).text_color(t.blocked).child("Unsaved")))
        .child(h_flex().gap(2).child(seg("view", "View")).child(seg("edit", "Edit")))
        .when(pg.mode === "edit", el => el.child(button(t, "sm-save", "Save", true, (_e, cx) => this.save(cx))))
        .when(pg.path !== this.paths.backlog, el => el.child(div().id("sm-delete").px(6).py(3).rounded(6).text_size(12)
          .text_color(t.dim).cursor_pointer().hover(s => s.bg(t.hover).text_color(t.blocked))
          .on_click(() => this.deletePage()).child("Delete"))))
      .child(pg.editor
        ? Editor.new(pg.editor).flex_1().min_h(0)
        : v_flex().id("sm-view").flex_1().min_h(0).overflow_y_scrollbar().px(18).py(14).gap(6)
          .when(Boolean(meta.title), el => el.child(div().text_size(20).font_semibold().child(meta.title)))
          .when(Boolean(meta.summary), el => el.child(div().pb(6).text_color(t.muted).italic().child(meta.summary)))
          .child(TextView.markdown(`sm-md-${pg.path}`, body.replace(/^\s+/, "")).selectable(true).text_size(13).text_color(t.foreground)));
  }

  close() {
    this.watching = null;
    this.setPage(null);
  }
}
