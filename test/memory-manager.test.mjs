import test from "node:test";
import assert from "node:assert/strict";
import { ShortTermMemory, globalShortTermMemory } from "../bin/lib/memory-shortterm.mjs";
import { LongTermMemory } from "../bin/lib/memory-longterm.mjs";

class MockStore {
  constructor() {
    this.nodes = new Map();
    this.statements = [];
  }

  async run(statement, parameters = {}) {
    this.statements.push({ statement, parameters });
    const params = parameters;

    if (statement.includes("CREATE CONSTRAINT") || statement.includes("CREATE INDEX")) {
      return [];
    }

    if (statement.includes("MERGE (m:Memory")) {
      const id = params.id;
      this.nodes.set(id, { ...params });
      return [];
    }

    if (statement.includes("MATCH (m:Memory")) {
      const results = [];
      for (const [, node] of this.nodes) {
        if (node.characterId !== params.characterId) continue;
        if (params.minImportance && Number(node.importance) < Number(params.minImportance)) continue;
        if (params.relatedCharacterId && !(node.relatedCharacters ?? []).includes(params.relatedCharacterId)) continue;
        results.push({ row: [JSON.stringify(node)] });
      }
      if (statement.includes("ORDER BY m.timestamp ASC")) {
        results.sort((a, b) => {
          const mA = JSON.parse(a.row[0]);
          const mB = JSON.parse(b.row[0]);
          return mA.timestamp - mB.timestamp;
        });
      } else if (statement.includes("ORDER BY m.timestamp DESC")) {
        results.sort((a, b) => {
          const mA = JSON.parse(a.row[0]);
          const mB = JSON.parse(b.row[0]);
          return mB.timestamp - mA.timestamp;
        });
      }
      return results;
    }

    return [];
  }
}

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

test("LongTermMemory initSchema runs constraints", async () => {
  const store = new MockStore();
  const ltm = new LongTermMemory(store);
  await ltm.initSchema();
  assert.ok(store.statements.length >= 4);
  assert.ok(store.statements[0].statement.includes("CREATE CONSTRAINT"));
});

test("LongTermMemory addMemory stores record", async () => {
  const store = new MockStore();
  const ltm = new LongTermMemory(store);
  const mem = await ltm.addMemory("char1", { content: "hello world" });
  assert.ok(mem.id.startsWith("ltm_"));
  assert.equal(mem.characterId, "char1");
  assert.equal(mem.content, "hello world");
  assert.equal(mem.importance, 3);
  assert.equal(mem.emotionalValence, 0);
  assert.ok(store.nodes.has(mem.id));
});

test("LongTermMemory addMemory clamps fields", async () => {
  const store = new MockStore();
  const ltm = new LongTermMemory(store);
  const mem = await ltm.addMemory("c1", {
    content: "test",
    emotionalValence: 2,
    importance: -5
  });
  assert.equal(mem.emotionalValence, 1);
  assert.equal(mem.importance, 1);
});

test("LongTermMemory retrieveMemories returns by importance", async () => {
  const store = new MockStore();
  const ltm = new LongTermMemory(store);
  await ltm.addMemory("c1", { content: "low imp", importance: 1 });
  await ltm.addMemory("c1", { content: "high imp", importance: 5 });
  const results = await ltm.retrieveMemories("c1", { minImportance: 3 });
  assert.equal(results.length, 1);
  assert.equal(results[0].content, "high imp");
});

test("LongTermMemory retrieveMemories limits results", async () => {
  const store = new MockStore();
  const ltm = new LongTermMemory(store);
  for (let i = 0; i < 5; i++) {
    await ltm.addMemory("c1", { content: `mem-${i}`, importance: 3 });
  }
  const results = await ltm.retrieveMemories("c1", { limit: 2 });
  assert.equal(results.length, 2);
});

test("LongTermMemory computeScore returns weighted result", async () => {
  const store = new MockStore();
  const ltm = new LongTermMemory(store);
  const mem = { content: "test", importance: 5, timestamp: Date.now() };
  const score = ltm.computeScore(mem, "test");
  assert.ok(score > 0 && score <= 1);
});

test("LongTermMemory getCharacterTimeline returns chronological order", async () => {
  const store = new MockStore();
  const ltm = new LongTermMemory(store);
  await ltm.addMemory("c1", { content: "first", timestamp: 100 });
  await ltm.addMemory("c1", { content: "third", timestamp: 300 });
  await ltm.addMemory("c1", { content: "second", timestamp: 200 });
  const timeline = await ltm.getCharacterTimeline("c1");
  assert.equal(timeline.length, 3);
  assert.equal(timeline[0].content, "first");
  assert.equal(timeline[2].content, "third");
});

test("LongTermMemory getRelatedCharacterMemories filters by related", async () => {
  const store = new MockStore();
  const ltm = new LongTermMemory(store);
  await ltm.addMemory("c1", { content: "about c2", relatedCharacters: ["c2"] });
  await ltm.addMemory("c1", { content: "about c3", relatedCharacters: ["c3"] });
  await ltm.addMemory("c1", { content: "no related", relatedCharacters: [] });
  const results = await ltm.getRelatedCharacterMemories("c1", "c2");
  assert.equal(results.length, 1);
  assert.equal(results[0].content, "about c2");
});

test("LongTermMemory stores to different characters independently", async () => {
  const store = new MockStore();
  const ltm = new LongTermMemory(store);
  await ltm.addMemory("c1", { content: "char1 mem" });
  await ltm.addMemory("c2", { content: "char2 mem" });
  const r1 = await ltm.retrieveMemories("c1");
  const r2 = await ltm.retrieveMemories("c2");
  assert.equal(r1.length, 1);
  assert.equal(r2.length, 1);
  assert.equal(r1[0].content, "char1 mem");
  assert.equal(r2[0].content, "char2 mem");
});

import { MemoryManager, createMemoryManager } from "../bin/lib/memory-manager.mjs";

test("MemoryManager routes low-importance to short-term", async () => {
  const store = new MockStore();
  store.skills = [];
  store.getSkill = async () => undefined;
  const mm = new MemoryManager({ worldStore: store });
  const result = await mm.remember("c1", { content: "trivial", importance: 1 }, "s1");
  assert.equal(result.layer, "short-term");
  const recent = mm.shortTerm.getRecent("s1", 10);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].content, "trivial");
});

test("MemoryManager routes high-importance to long-term", async () => {
  const store = new MockStore();
  store.getSkill = async () => undefined;
  const mm = new MemoryManager({ worldStore: store });
  const result = await mm.remember("c1", { content: "critical", importance: 5 });
  assert.equal(result.layer, "long-term");
  assert.ok(result.id.startsWith("ltm_"));
});

test("MemoryManager recall gathers all three layers", async () => {
  const store = new MockStore();
  store.getSkill = async (id) =>
    id === "c1" ? { characterId: "c1", name: "Alice", voice: ["calm"], knownFacts: ["f1"] } : undefined;
  const mm = new MemoryManager({ worldStore: store });
  await mm.remember("c1", { content: "session note", importance: 1 }, "s1");
  await mm.remember("c1", { content: "important event", importance: 4 });
  const results = await mm.recall("c1", { sessionId: "s1" });
  assert.equal(results.shortTerm.length, 1);
  assert.equal(results.shortTerm[0].content, "session note");
  assert.equal(results.longTerm.length, 1);
  assert.equal(results.longTerm[0].content, "important event");
  assert.equal(results.semantic.name, "Alice");
});

test("MemoryManager mergeMemories deduplicates and orders correctly", async () => {
  const store = new MockStore();
  const mm = new MemoryManager({ worldStore: store });
  const results = {
    shortTerm: [{ content: "shared", text: "shared" }, { content: "only-st", text: "only-st" }],
    longTerm: [{ content: "shared" }, { content: "only-lt" }],
    semantic: { characterId: "c1", name: "Bob", relationships: { c2: "friend" } }
  };
  const merged = mm.mergeMemories(results);
  assert.equal(merged.length, 4);
  assert.equal(merged[0].type, "semantic");
  const contents = merged.map((m) => m.content);
  assert.ok(contents.includes("shared"));
  assert.ok(contents.includes("only-st"));
  assert.ok(contents.includes("only-lt"));
  const sharedCount = contents.filter((c) => c === "shared").length;
  assert.equal(sharedCount, 1);
});

test("MemoryManager getContextSummary returns formatted text", async () => {
  const store = new MockStore();
  store.getSkill = async () => ({
    characterId: "c1",
    name: "Alice",
    identity: ["warrior"],
    voice: ["stern"],
    values: ["honor"],
    relationships: { c2: "rival" },
    knownFacts: ["f1", "f2"],
    behaviorPolicy: { greeting: "nods curtly" }
  });
  const mm = new MemoryManager({ worldStore: store });
  await mm.remember("c1", { content: "saved the village", importance: 4 }, "s1");
  mm.shortTerm.addEntry("s1", { text: "arrived at the tavern", content: "arrived at the tavern" });
  const summary = await mm.getContextSummary("c1", "s1");
  assert.ok(summary.includes("[Character Profile]"));
  assert.ok(summary.includes("Alice"));
  assert.ok(summary.includes("[Important Memories]"));
  assert.ok(summary.includes("saved the village"));
  assert.ok(summary.includes("[Recent Context]"));
  assert.ok(summary.includes("arrived at the tavern"));
});

test("MemoryManager clearSession removes session data", async () => {
  const store = new MockStore();
  store.getSkill = async () => undefined;
  const mm = new MemoryManager({ worldStore: store });
  await mm.remember("c1", { content: "temp", importance: 1 }, "s1");
  assert.equal(mm.shortTerm.getRecent("s1", 10).length, 1);
  mm.clearSession("s1");
  assert.equal(mm.shortTerm.getRecent("s1", 10).length, 0);
});

test("createMemoryManager returns MemoryManager instance", () => {
  const store = new MockStore();
  const mm = createMemoryManager({ worldStore: store });
  assert.ok(mm instanceof MemoryManager);
  assert.ok(mm.shortTerm instanceof ShortTermMemory);
});
