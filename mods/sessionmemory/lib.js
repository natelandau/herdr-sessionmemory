// Pure helpers with no Herdr imports, so node --test can load them.

export const SECTIONS = [
  { key: "backlog", label: "Backlog", kind: "file", order: "alpha", dated: false },
  { key: "reference", label: "Reference", kind: "dir", order: "alpha", dated: false },
  { key: "learnings", label: "Learnings", kind: "dir", order: "alpha", dated: false },
  { key: "runbooks", label: "Runbooks", kind: "dir", order: "alpha", dated: true },
  { key: "specs", label: "Specs", kind: "dir", order: "newest", dated: true },
  { key: "plans", label: "Plans", kind: "dir", order: "newest", dated: true },
  { key: "logs", label: "Logs", kind: "dir", order: "newest", dated: true },
];

export const NEW_KINDS = [
  { value: "learning", label: "Learning", section: "learnings", fields: ["title", "summary"] },
  { value: "spec", label: "Spec", section: "specs", fields: ["title"] },
  { value: "plan", label: "Plan", section: "plans", fields: ["title"] },
  { value: "runbook", label: "Runbook", section: "runbooks", fields: ["title"] },
  { value: "reference", label: "Reference", section: "reference", fields: ["title"] },
  { value: "backlog", label: "Backlog item", section: "backlog", fields: ["kind", "size", "title", "topic"] },
];

export const BACKLOG_KINDS = [
  ...["feat", "fix", "refactor", "perf", "docs", "test", "build", "ci"].map(v => ({ value: v, label: v })),
  { value: "decide", label: "Open question" },
];

export const SIZES = ["S", "M", "L"];

function unquote(v) {
  if (v.length >= 2 && (v[0] === "'" || v[0] === '"') && v[v.length - 1] === v[0]) {
    const inner = v.slice(1, -1);
    return v[0] === "'" ? inner.replace(/''/g, "'") : inner.replace(/\\"/g, '"');
  }
  return v;
}

// Splits text into lines, remembering the line ending and dropping a byte-order mark.
function split(text) {
  const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
  const body = text.slice(bom.length), eol = body.includes("\r\n") ? "\r\n" : "\n";
  return { bom, eol, lines: body.split(eol) };
}

// Locates a leading `---` block; returns the line index of the closing fence or -1.
function fence(lines) {
  if (lines[0] !== "---") return -1;
  for (let i = 1; i < lines.length; i++) if (lines[i] === "---") return i;
  return -1;
}

// Reads the YAML subset the sessionmemory CLI writes: top-level `key: value`,
// quoted scalars, and indented continuation lines folded with a space.
function readMeta(lines, end) {
  const meta = {};
  let last = null;
  for (const line of lines.slice(1, end)) {
    const m = /^([A-Za-z_][\w-]*):\s?(.*)$/.exec(line);
    if (m) { last = m[1]; meta[last] = m[2].trim(); }
    else if (last && /^\s+\S/.test(line)) meta[last] = `${meta[last]} ${line.trim()}`.trim();
  }
  for (const k of Object.keys(meta)) meta[k] = unquote(meta[k]);
  return meta;
}

export function parsePage(text) {
  const { eol, lines } = split(text), end = fence(lines);
  if (end < 0) return { meta: {}, body: text, hasFrontmatter: false };
  return { meta: readMeta(lines, end), body: lines.slice(end + 1).join(eol), hasFrontmatter: true };
}

// The frontmatter alone, for listings that never show the body.
export function parseMeta(text) {
  const head = text.slice(0, 8192), { lines } = split(head), end = fence(lines);
  return end < 0 ? (text.length > head.length ? parsePage(text).meta : {}) : readMeta(lines, end);
}

export function pageTitle(meta, path) {
  return meta.title || path.split("/").pop().replace(/\.md$/, "");
}

export function bumpUpdated(text, iso) {
  const { bom, eol, lines } = split(text), end = fence(lines);
  if (end < 0) return text;
  for (let i = 1; i < end; i++) {
    const m = /^updated:\s?(.*)$/.exec(lines[i]);
    if (!m) continue;
    const q = m[1].trim()[0];
    lines[i] = `updated: ${q === "'" || q === '"' ? `${q}${iso}${q}` : iso}`;
    return bom + lines.join(eol);
  }
  return text;
}

export function isoNow(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function dateOf(name) {
  return /^(\d{4}-\d{2}-\d{2})/.exec(name)?.[1] ?? null;
}

export function sortPages(order, pages) {
  const copy = [...pages];
  if (order === "newest") return copy.sort((a, b) => b.name.localeCompare(a.name));
  return copy.sort((a, b) => (a.title ?? a.name).localeCompare(b.title ?? b.name, undefined, { sensitivity: "base" }));
}

export function sortDirs(order, dirs) {
  return [...dirs].sort((a, b) => order === "newest" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
}

export function newArgs(kind, fields, root) {
  const args = ["new", kind, "-C", root, "--json"];
  const spec = NEW_KINDS.find(k => k.value === kind);
  for (const f of spec?.fields ?? []) {
    let v = (fields[f] ?? "").trim();
    if (f === "topic") v = v.replace(/^#+/, "");
    // `--opt=value` keeps a value that starts with "-" from reading as an option.
    if (v) args.push(`--${f}=${v}`);
  }
  return args;
}
