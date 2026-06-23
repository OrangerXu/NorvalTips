import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chooseSpeaker } from "../bin/lib/speaker-scheduler.mjs";

const execFileAsync = promisify(execFile);
const cli = "bin/novaltips.mjs";

async function run(args) {
  const { stdout } = await execFileAsync(process.execPath, [cli, ...args], {
    cwd: process.cwd()
  });
  return stdout;
}

test("detects knowledge-boundary violations", async () => {
  const stdout = await run(["check-boundary", "fan_xian", "emperor_final_plan"]);
  const report = JSON.parse(stdout);
  assert.equal(report.passed, false);
  assert.equal(report.issues[0].type, "knowledge_boundary");
});

test("exports a character skill as markdown", async () => {
  const stdout = await run(["export-skill", "fan_xian"]);
  assert.match(stdout, /Character Skill/);
  assert.match(stdout, /Fan-Xian-like protagonist/);
});

test("does not include option values in world query", async () => {
  const stdout = await run([
    "query-world",
    "fan_xian",
    "--world",
    "examples/qingyu-like/world.json"
  ]);
  const result = JSON.parse(stdout);
  assert.equal(result.query, "fan_xian");
  assert.ok(result.facts.length > 0);
});

test("simulates a scene and writes trace state", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "novaltips-"));
  const stdout = await run([
    "simulate-scene",
    "examples/qingyu-like/scene-court-conflict.json",
    "--state-dir",
    stateDir
  ]);
  const result = JSON.parse(stdout);
  assert.equal(result.turns.length, 3);
  assert.deepEqual(
    result.turns.map((turn) => turn.speaker),
    ["emperor", "chen_pingping", "fan_xian"]
  );

  const trace = JSON.parse(await readFile(join(stateDir, "last_trace.json"), "utf8"));
  assert.equal(trace.kind, "scene_simulation");
  assert.equal(trace.output.turns.length, 3);
  assert.equal(trace.output.finalState.currentTurn, 3);
  assert.equal(trace.output.finalState.conflictIntensity, 3);

  const persistedState = JSON.parse(
    await readFile(join(stateDir, "scenes", "court_conflict_001.json"), "utf8")
  );
  assert.equal(persistedState.characterMemories.emperor.length, 1);
  assert.equal(persistedState.characterMemories.chen_pingping.length, 1);
  assert.equal(persistedState.characterMemories.fan_xian.length, 1);
});

test("continues turn numbering from persisted scene state", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "novaltips-continuation-"));
  const args = [
    "simulate-scene",
    "examples/qingyu-like/scene-court-conflict.json",
    "--state-dir",
    stateDir
  ];
  await run(args);
  const second = JSON.parse(await run(args));
  assert.deepEqual(second.turns.map((turn) => turn.turn), [4, 5, 6]);
  assert.equal(second.finalState.currentTurn, 6);
  assert.equal(second.finalState.conflictIntensity, 6);
});

test("persists one memory per character after simulation", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "novaltips-memory-"));
  const stdout = await run([
    "simulate-scene",
    "examples/qingyu-like/scene-court-conflict.json",
    "--state-dir",
    stateDir
  ]);
  const result = JSON.parse(stdout);

  assert.equal(result.turns.length, 3);
  assert.deepEqual(
    result.turns.map((turn) => turn.speaker),
    ["emperor", "chen_pingping", "fan_xian"]
  );
  assert.equal(result.finalState.currentTurn, 3);
  assert.equal(result.finalState.conflictIntensity, 3);

  const sceneState = JSON.parse(
    await readFile(join(stateDir, "scenes", "court_conflict_001.json"), "utf8")
  );

  // Verify memory content
  assert.equal(
    sceneState.characterMemories.emperor[0].content,
    "emperor took a position during court_conflict_001."
  );
  assert.equal(
    sceneState.characterMemories.chen_pingping[0].content,
    "chen_pingping took a position during court_conflict_001."
  );
  assert.equal(
    sceneState.characterMemories.fan_xian[0].content,
    "fan_xian took a position during court_conflict_001."
  );
});

test("keeps a direct mention pending until the character responds", async () => {
  const world = JSON.parse(
    await readFile("examples/qingyu-like/world.json", "utf8")
  );
  const scene = JSON.parse(
    await readFile("examples/qingyu-like/scene-court-conflict.json", "utf8")
  );
  const turns = [
    {
      turn: 1,
      speaker: "emperor",
      content: "Chen Pingping, state your assessment. Fan Xian, observe closely."
    },
    {
      turn: 2,
      speaker: "chen_pingping",
      content: "Your Majesty, perhaps the Ministry should verify the reports first."
    }
  ];
  const selected = chooseSpeaker(world, scene, turns);
  assert.equal(selected.speaker, "fan_xian");
});
