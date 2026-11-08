// Which vault project the active space belongs to, what its sections hold, and the side panel.
import * as fs from "fs/promises";
import { spaces, panes, focused, exec, readTextFile, layout, run, shared, setShared } from "herdr";
import { SECTIONS, parseMeta, pageTitle, sortPages, sortDirs, dateOf } from "./lib.js";

export const PANEL = "panel", STACK = "panel-body", CHILD = "sessionmemory", BUTTON = "sessionmemory-button";
const MAX_PAGES = 1000, READERS = 8;

// The same "where am I" rule as the shipped Files and Changes mods.
export function context() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { folder: pane?.cwd || f?.cwd || space?.folder || null, on };
}

// folder -> paths, or null when the folder is in no project. Absent: never looked up.
const cache = new Map();
const inflight = new Map();

export function cached(folder) {
  return cache.get(folder);
}

export async function resolve(folder, on, { fresh = false } = {}) {
  if (!folder || on) return null;
  if (cache.has(folder) && !fresh) return cache.get(folder);
  if (inflight.has(folder)) return inflight.get(folder);
  const p = (async () => {
    let paths = null;
    try {
      const r = await exec("sessionmemory", ["path", "--json", "-C", folder]);
      if (r.code === 0) paths = JSON.parse(r.stdout);
    } catch { paths = null; }
    cache.set(folder, paths);
    return paths;
  })();
  inflight.set(folder, p);
  try { return await p; } finally { inflight.delete(folder); }
}

// page path -> { title, sub } so a listing reads only pages that changed since the last one.
const described = new Map();

// Drops cached descriptions for changed paths; a path that is a folder drops everything under it.
export function forget(paths) {
  for (const changed of paths) {
    for (const key of described.keys()) if (key === changed || key.startsWith(`${changed}/`)) described.delete(key);
  }
}

async function walk(dir, rel, out, depth) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const nodes = await Promise.all(entries.map(async e => {
    if (e.name.startsWith(".")) return null;
    const path = `${dir}/${e.name}`, relPath = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (depth > 6) return null;
      const children = await walk(path, relPath, out, depth + 1);
      return children.length ? { dir: true, path, name: e.name, rel: relPath, children } : null;
    }
    if (!e.name.endsWith(".md") || out.count >= MAX_PAGES) return null;
    out.count++;
    out.pages.push({ dir: false, path, name: e.name, rel: relPath });
    return out.pages[out.pages.length - 1];
  }));
  return nodes.filter(Boolean);
}

async function describe(page, dated) {
  let d = described.get(page.path);
  if (!d) {
    const meta = parseMeta(await readTextFile(page.path).catch(() => null) ?? "");
    const date = dateOf(page.name) ?? (meta.created ? meta.created.slice(0, 10) : null);
    d = { title: pageTitle(meta, page.path), sub: (dated && date) || meta.summary || "" };
    described.set(page.path, d);
  }
  Object.assign(page, d);
}

// Reads pages a few at a time: in order is slow, all at once floods the host.
async function describeAll(pages, dated) {
  let next = 0;
  await Promise.all(Array.from({ length: READERS }, async () => {
    while (next < pages.length) await describe(pages[next++], dated);
  }));
}

function order(nodes, sortOrder) {
  for (const n of nodes) if (n.dir) n.children = order(n.children, sortOrder);
  return [...sortDirs(sortOrder, nodes.filter(n => n.dir)), ...sortPages(sortOrder, nodes.filter(n => !n.dir))];
}

// Only sections that exist and hold at least one page.
export async function listSections(paths) {
  const sections = await Promise.all(SECTIONS.map(async s => {
    const where = paths[s.key];
    if (!where) return null;
    if (s.kind === "file") {
      const text = await readTextFile(where).catch(() => null);
      return text?.trim() ? { key: s.key, label: s.label, file: where, pages: [], count: null } : null;
    }
    const out = { count: 0, pages: [] };
    const nodes = await walk(where, "", out, 0);
    if (!nodes.length) return null;
    await describeAll(out.pages, s.dated);
    return { key: s.key, label: s.label, pages: order(nodes, s.order), count: out.count };
  }));
  return sections.filter(Boolean);
}

function find(node, ids, found = {}) {
  if (!node || typeof node !== "object") return found;
  if (ids.includes(node.id)) found[node.id] = node;
  for (const c of node.children ?? []) find(c, ids, found);
  return found;
}

export function buttonBlock() {
  return find(layout(), [BUTTON])[BUTTON] ?? null;
}

export function isOpen() {
  const { [PANEL]: panel, [STACK]: body } = find(layout(), [PANEL, STACK]);
  return Boolean(panel && !panel.hidden && body?.active === CHILD);
}

export function openPanel() {
  run("layout.select", { stack: STACK, child: CHILD });
  run("layout.show", { id: PANEL });
}

export function togglePanel() {
  if (isOpen()) run("layout.hide", { id: PANEL });
  else openPanel();
}

// The shipped tab bar restores, per space, only panels named in this list.
export function ensurePanelListed() {
  const list = shared("workspace.panels");
  const now = Array.isArray(list) ? list : ["files", "changes"];
  if (!now.includes(CHILD)) setShared("workspace.panels", [...now, CHILD]);
}
