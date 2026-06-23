import test from "node:test";
import assert from "node:assert/strict";
import { ShortTermMemory, globalShortTermMemory } from "../bin/lib/memory-shortterm.mjs";

test("adds and retrieves entries", () => {
  const mem = new ShortTermMemory();
  mem.addEntry("s1", { text: "hello" });
  mem.addEntry("s1", { text: "world" });
  const recent = mem.getRecent("s1", 10);
  assert.equal(recent.length, 2);
  assert.equal(recent[0].text, "hello");
  assert.equal(recent[1].text, "world");
  assert.ok(recent[0].id);
  assert.ok(recent[0].timestamp);
});

test("getRecent returns only requested count", () => {
  const mem = new ShortTermMemory();
  for (let i = 0; i < 5; i++) {
    mem.addEntry("s1", { text: `item-${i}` });
  }
  const recent = mem.getRecent("s1", 3);
  assert.equal(recent.length, 3);
  assert.equal(recent[0].text, "item-2");
  assert.equal(recent[2].text, "item-4");
});

test("compresses when window exceeded", () => {
  const mem = new ShortTermMemory({ windowSize: 5, overlapSize: 1 });
  for (let i = 0; i < 7; i++) {
    mem.addEntry("s1", { text: `msg-${i}` });
  }
  const session = mem.getSession("s1");
  assert.ok(session.summary, "summary should exist after compression");
  assert.ok(session.summary.includes("msg-0"), "summary should contain old entries");
  assert.ok(session.entries.length <= 5, "entries should be within window");
  assert.equal(session.entries[0].text, "msg-2");
});

test("sessions are isolated", () => {
  const mem = new ShortTermMemory();
  mem.addEntry("a", { text: "from-a" });
  mem.addEntry("b", { text: "from-b" });
  const ra = mem.getRecent("a", 10);
  const rb = mem.getRecent("b", 10);
  assert.equal(ra.length, 1);
  assert.equal(rb.length, 1);
  assert.equal(ra[0].text, "from-a");
  assert.equal(rb[0].text, "from-b");
});

test("clear removes session", () => {
  const mem = new ShortTermMemory();
  mem.addEntry("s1", { text: "data" });
  mem.clear("s1");
  const recent = mem.getRecent("s1", 10);
  assert.equal(recent.length, 0);
});

test("clearAll removes all sessions", () => {
  const mem = new ShortTermMemory();
  mem.addEntry("a", { text: "data" });
  mem.addEntry("b", { text: "data" });
  mem.clearAll();
  assert.equal(mem.sessions.size, 0);
});

test("getSummary returns null for new session", () => {
  const mem = new ShortTermMemory();
  assert.equal(mem.getSummary("new"), null);
});

test("globalShortTermMemory is a ShortTermMemory instance", () => {
  assert.ok(globalShortTermMemory instanceof ShortTermMemory);
});
