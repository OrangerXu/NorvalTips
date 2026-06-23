import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWorldStore,
  getNeo4jConfig,
  JsonWorldStore,
  Neo4jHttpWorldStore
} from "../bin/lib/world-store.mjs";
import {
  buildExtractionMessages,
  chunkDocument,
  mergeExtractionResults,
  normalizeExtractedWorld
} from "../bin/lib/document-ingest.mjs";

test("JSON world store upserts and queries facts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "novaltips-world-"));
  const path = join(dir, "world.json");
  await writeFile(path, JSON.stringify({ facts: [], skills: [] }), "utf8");
  const store = new JsonWorldStore(path);
  await store.upsertWorld({
    facts: [{ id: "event_1", kind: "event", summary: "A court dispute", characters: ["fan"] }],
    skills: [{ characterId: "fan", name: "Fan" }]
  });
  assert.equal((await store.searchFacts("court")).length, 1);
  assert.equal((await store.factsForCharacter("fan")).length, 1);
  assert.equal((await store.getSkill("fan")).name, "Fan");
  const saved = JSON.parse(await readFile(path, "utf8"));
  assert.equal(saved.facts.length, 1);
});

test("JSON world store accepts UTF-8 BOM files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "novaltips-bom-"));
  const path = join(dir, "world.json");
  await writeFile(path, `\uFEFF${JSON.stringify({ facts: [], skills: [] })}`, "utf8");
  const store = new JsonWorldStore(path);
  const world = await store.load();
  assert.deepEqual(world, { facts: [], skills: [] });
});

test("world store factory selects Neo4j adapter", () => {
  const store = createWorldStore({ env: { NOVELTIPS_WORLD_STORE: "neo4j" } });
  assert.ok(store instanceof Neo4jHttpWorldStore);
});

test("reads Neo4j HTTP configuration", () => {
  const config = getNeo4jConfig({
    NEO4J_HTTP_URL: "http://neo4j.test:7474",
    NEO4J_DATABASE: "stories",
    NEO4J_USERNAME: "reader",
    NEO4J_PASSWORD: "secret"
  });
  assert.equal(config.database, "stories");
  assert.equal(config.username, "reader");
});

test("chunks documents by chapter headings", () => {
  const text = "Chapter 1\nFirst scene.\nChapter 2\nSecond scene.";
  const chunks = chunkDocument(text);
  assert.equal(chunks.length, 2);
  assert.match(chunks[0], /Chapter 1/);
  assert.match(chunks[1], /Chapter 2/);
});

test("merges extraction results by stable ids", () => {
  const merged = mergeExtractionResults([
    {
      facts: [{ id: "char_fan", kind: "character" }],
      skills: [{ characterId: "fan", aliases: ["Fan"], voice: ["witty"] }]
    },
    {
      facts: [{ id: "char_fan", kind: "character", summary: "updated" }],
      skills: [{ characterId: "fan", aliases: ["Young Fan"], voice: ["probing"] }]
    }
  ]);
  assert.equal(merged.facts.length, 1);
  assert.deepEqual(merged.skills[0].aliases, ["Fan", "Young Fan"]);
  assert.deepEqual(merged.skills[0].voice, ["witty", "probing"]);
});

test("builds extraction prompt with strict schema", () => {
  const messages = buildExtractionMessages({ chunk: "text", sourceId: "novel", chunkIndex: 0 });
  assert.match(messages[0].content, /strict JSON/);
  assert.match(messages[1].content, /knownFacts/);
});

test("normalizes skills and adds missing character facts", () => {
  const world = normalizeExtractedWorld({
    facts: [],
    skills: [{ characterId: "fan", name: "Young Lord Fan" }]
  }, "chapter_1");
  assert.equal(world.skills[0].voice.length, 0);
  assert.equal(world.facts[0].kind, "character");
  assert.deepEqual(world.facts[0].characters, ["fan"]);
});
