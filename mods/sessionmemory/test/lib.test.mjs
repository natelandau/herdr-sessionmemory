import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTIONS, parsePage, parseMeta, pageTitle, bumpUpdated, isoNow, dateOf, sortPages, sortDirs, newArgs, BACKLOG_KINDS, NEW_KINDS } from "../lib.js";

const LEARNING = `---
title: Add each plugin's plugin.json version to commitizen version_files
uuid: bdc338ca-d8e9-48dd-8cb7-72f54028b558
summary: Each plugin's plugin.json must be listed in commitizen version_files or it silently
  drifts behind the project version
created: '2026-06-28T00:56:29Z'
updated: '2026-06-28T00:56:29Z'
---
Body **here**.
`;

test("SECTIONS are in spec order and keyed like `sessionmemory path --json`", () => {
  assert.deepEqual(SECTIONS.map(s => s.key), ["backlog", "reference", "learnings", "runbooks", "specs", "plans", "logs"]);
  assert.deepEqual(SECTIONS.map(s => s.label), ["Backlog", "Reference", "Learnings", "Runbooks", "Specs", "Plans", "Logs"]);
  assert.equal(SECTIONS[0].kind, "file");
});

test("parsePage reads CLI frontmatter, joining folded lines and stripping quotes", () => {
  const p = parsePage(LEARNING);
  assert.equal(p.hasFrontmatter, true);
  assert.equal(p.meta.title, "Add each plugin's plugin.json version to commitizen version_files");
  assert.equal(p.meta.summary, "Each plugin's plugin.json must be listed in commitizen version_files or it silently drifts behind the project version");
  assert.equal(p.meta.created, "2026-06-28T00:56:29Z");
  assert.equal(p.body, "Body **here**.\n");
});

test("parsePage without frontmatter returns the whole text as body", () => {
  const p = parsePage("# Backlog\n\n- item\n");
  assert.equal(p.hasFrontmatter, false);
  assert.deepEqual(p.meta, {});
  assert.equal(p.body, "# Backlog\n\n- item\n");
});

test("parsePage with unterminated frontmatter treats it as plain text", () => {
  const text = "---\ntitle: x\nno end here\n";
  const p = parsePage(text);
  assert.equal(p.hasFrontmatter, false);
  assert.equal(p.body, text);
});

test("bumpUpdated replaces only the updated line and keeps its quoting", () => {
  const out = bumpUpdated(LEARNING, "2026-11-08T14:40:33Z");
  assert.match(out, /^updated: '2026-11-08T14:40:33Z'$/m);
  assert.match(out, /^created: '2026-06-28T00:56:29Z'$/m);
  assert.equal(out.replace("2026-11-08T14:40:33Z", "2026-06-28T00:56:29Z"), LEARNING);
});

test("bumpUpdated leaves files without frontmatter or without updated alone", () => {
  assert.equal(bumpUpdated("# Backlog\nupdated: x\n", "2026-11-08T00:00:00Z"), "# Backlog\nupdated: x\n");
  const noKey = "---\ntitle: a\n---\nbody\n";
  assert.equal(bumpUpdated(noKey, "2026-11-08T00:00:00Z"), noKey);
});

test("bumpUpdated does not touch an updated line in the body", () => {
  const text = "---\ntitle: a\nupdated: '2026-01-01T00:00:00Z'\n---\nupdated: keep\n";
  assert.equal(bumpUpdated(text, "2026-11-08T00:00:00Z"), "---\ntitle: a\nupdated: '2026-11-08T00:00:00Z'\n---\nupdated: keep\n");
});

test("isoNow formats UTC to seconds", () => {
  assert.equal(isoNow(new Date(Date.UTC(2026, 10, 8, 14, 40, 33, 999))), "2026-11-08T14:40:33Z");
});

test("dateOf reads a leading YYYY-MM-DD", () => {
  assert.equal(dateOf("2026-07-24-protect-remote-hook-design.md"), "2026-07-24");
  assert.equal(dateOf("plugin-version-files.md"), null);
});

test("sortPages: dated sections newest first, others A to Z by title", () => {
  const specs = [{ name: "2026-06-19-a.md", title: "A" }, { name: "2026-10-26-b.md", title: "B" }, { name: "2026-07-24-c.md", title: "C" }];
  assert.deepEqual(sortPages("newest", specs).map(p => p.name), ["2026-10-26-b.md", "2026-07-24-c.md", "2026-06-19-a.md"]);
  const learnings = [{ name: "z.md", title: "beta" }, { name: "a.md", title: "Alpha" }, { name: "m.md", title: "gamma" }];
  assert.deepEqual(sortPages("alpha", learnings).map(p => p.title), ["Alpha", "beta", "gamma"]);
});

test("newArgs builds the CLI argv for each kind", () => {
  assert.deepEqual(newArgs("learning", { title: "T", summary: "S" }, "/r"),
    ["new", "learning", "-C", "/r", "--json", "--title=T", "--summary=S"]);
  assert.deepEqual(newArgs("spec", { title: "T" }, "/r"), ["new", "spec", "-C", "/r", "--json", "--title=T"]);
  assert.deepEqual(newArgs("backlog", { kind: "decide", size: "S", title: "T", topic: "" }, "/r"),
    ["new", "backlog", "-C", "/r", "--json", "--kind=decide", "--size=S", "--title=T"]);
  assert.deepEqual(newArgs("backlog", { kind: "fix", size: "M", title: "T", topic: "ui" }, "/r").slice(-1), ["--topic=ui"]);
});

test("kind lists follow the CLI", () => {
  assert.deepEqual(BACKLOG_KINDS.map(k => k.value), ["feat", "fix", "refactor", "perf", "docs", "test", "build", "ci", "decide"]);
  assert.equal(BACKLOG_KINDS.find(k => k.value === "decide").label, "Open question");
  assert.deepEqual(NEW_KINDS.map(k => k.value), ["learning", "spec", "plan", "runbook", "reference", "backlog"]);
  assert.ok(!NEW_KINDS.some(k => k.value === "log"));
});

test("parsePage reads frontmatter with CRLF line endings or a byte-order mark", () => {
  assert.equal(parsePage("---\r\ntitle: A\r\n---\r\nbody\r\n").meta.title, "A");
  assert.equal(parsePage("﻿---\ntitle: B\n---\nbody\n").meta.title, "B");
});

test("bumpUpdated works with CRLF frontmatter", () => {
  assert.equal(bumpUpdated("---\r\nupdated: '2026-01-01T00:00:00Z'\r\n---\r\n", "2026-11-08T00:00:00Z"), "---\r\nupdated: '2026-11-08T00:00:00Z'\r\n---\r\n");
});

test("newArgs binds values to their options and strips a leading # from the topic", () => {
  assert.deepEqual(newArgs("spec", { title: "-rf thing" }, "/r"), ["new", "spec", "-C", "/r", "--json", "--title=-rf thing"]);
  assert.deepEqual(newArgs("backlog", { kind: "fix", size: "M", title: "T", topic: "#ui" }, "/r").slice(-1), ["--topic=ui"]);
});

test("SECTIONS mark which sections show dates", () => {
  assert.deepEqual(SECTIONS.filter(s => s.dated).map(s => s.key), ["runbooks", "specs", "plans", "logs"]);
});

test("parseMeta returns the same metadata as parsePage", () => {
  assert.deepEqual(parseMeta(LEARNING), parsePage(LEARNING).meta);
  assert.deepEqual(parseMeta("# no frontmatter\n"), {});
});

test("pageTitle prefers the frontmatter title, else the file name without .md", () => {
  assert.equal(pageTitle({ title: "T" }, "/v/specs/a.md"), "T");
  assert.equal(pageTitle({}, "/v/specs/2026-01-01-a.md"), "2026-01-01-a");
});

test("sortDirs orders folders like their section", () => {
  const dirs = [{ name: "2026-01" }, { name: "2026-03" }, { name: "2026-02" }];
  assert.deepEqual(sortDirs("newest", dirs).map(d => d.name), ["2026-03", "2026-02", "2026-01"]);
  assert.deepEqual(sortDirs("alpha", dirs).map(d => d.name), ["2026-01", "2026-02", "2026-03"]);
});
