#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { llmReviewReply } from "./lib/llm-review.mjs";
import { llmDraftSceneReply } from "./lib/llm-scene.mjs";
import { applyStateDelta, SceneStateStore } from "./lib/scene-state.mjs";
import { chooseSpeaker } from "./lib/speaker-scheduler.mjs";
import { createWorldStore } from "./lib/world-store.mjs";
import { ingestDocument } from "./lib/document-ingest.mjs";
import { llmRefineCharacterSkill } from "./lib/llm-skill.mjs";
import { createMemoryManager } from "./lib/memory-manager.mjs";

const DEFAULT_WORLD = "examples/qingyu-like/world.json";
const DEFAULT_STATE_DIR = ".novaltips/state";
const MODERN_TERMS = ["phone", "internet", "AI", "algorithm", "product manager"];

async function loadDotEnv(path = ".env") {
  if (!existsSync(path)) return;
  const raw = await readFile(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    const value = trimmed.slice(equals + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function usage() {
  return [
    "NovalTips Pi workspace CLI",
    "",
    "Usage:",
    "  node bin/novaltips.mjs query-world <query> [--world path]",
    "  node bin/novaltips.mjs export-skill <characterId> [--world path]",
    "  node bin/novaltips.mjs check-boundary <characterId> <claim> [--world path]",
    "  node bin/novaltips.mjs review-reply <characterId> <reply> [--world path]",
    "  node bin/novaltips.mjs llm-review-reply <characterId> <reply> [--world path]",
    "  node bin/novaltips.mjs llm-validate-scene <scenePath> [--world path] [--state-dir dir]",
    "  node bin/novaltips.mjs llm-simulate-scene <scenePath> [--world path] [--state-dir dir]",
    "  node bin/novaltips.mjs simulate-scene <scenePath> [--world path] [--state-dir dir]",
    "  node bin/novaltips.mjs show-scene-state <sceneId> [--state-dir dir]",
    "  node bin/novaltips.mjs reset-scene-state <scenePath> [--state-dir dir]",
    "  node bin/novaltips.mjs sync-world <worldJsonPath>",
    "  node bin/novaltips.mjs ingest-document <textPath> [--source-id id] [--max-chunks n]",
    "  node bin/novaltips.mjs refine-skill <characterId>",
    "  node bin/novaltips.mjs demo",
    ""
  ].join("\n");
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

function positionalArgs(args) {
  const valueOptions = new Set(["--world", "--state-dir", "--source-id", "--max-chunks"]);
  const result = [];
  for (let index = 0; index < args.length; index += 1) {
    if (valueOptions.has(args[index])) {
      index += 1;
      continue;
    }
    if (!args[index].startsWith("--")) result.push(args[index]);
  }
  return result;
}

async function loadJson(path) {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

async function saveJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function allText(value) {
  return JSON.stringify(value).toLowerCase();
}

function searchFacts(world, query) {
  const normalized = query.toLowerCase();
  return world.facts.filter((fact) => allText(fact).includes(normalized));
}

function getSkill(world, characterId) {
  return world.skills.find((skill) => skill.characterId === characterId);
}

function skillToMarkdown(skill) {
  return [
    `# Character Skill: ${skill.name}`,
    "",
    "## Aliases",
    ...(skill.aliases ?? []).map((item) => `- ${item}`),
    "",
    "## Identity",
    ...skill.identity.map((item) => `- ${item}`),
    "",
    "## Voice",
    ...skill.voice.map((item) => `- ${item}`),
    "",
    "## Voice Cues",
    ...(skill.voiceCues ?? []).map((item) => `- ${item}`),
    "",
    "## Values",
    ...skill.values.map((item) => `- ${item}`),
    "",
    "## Behavior Policy",
    ...Object.entries(skill.behaviorPolicy).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Known Facts",
    ...skill.knownFacts.map((item) => `- ${item}`),
    "",
    "## Unknown Facts",
    ...skill.unknownFacts.map((item) => `- ${item}`),
    "",
    "## Relationships",
    ...Object.entries(skill.relationships).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Forbidden",
    ...skill.forbidden.map((item) => `- ${item}`)
  ].join("\n");
}

function checkBoundary(world, characterId, claim) {
  const skill = getSkill(world, characterId);
  if (!skill) {
    return {
      passed: false,
      score: 0,
      issues: [{
        type: "knowledge_boundary",
        description: `Unknown character: ${characterId}`,
        suggestion: "Create or import a Character Skill before checking claims."
      }]
    };
  }

  const lowerClaim = claim.toLowerCase();
  const hitUnknown = skill.unknownFacts.find((fact) => lowerClaim.includes(String(fact).toLowerCase()));
  if (hitUnknown) {
    return {
      passed: false,
      score: 0.2,
      issues: [{
        type: "knowledge_boundary",
        description: `${skill.name} should not know or confirm: ${hitUnknown}`,
        suggestion: "Rewrite as suspicion, evasion, or stage-appropriate uncertainty."
      }]
    };
  }

  return { passed: true, score: 1, issues: [] };
}

function reviewReply(world, characterId, reply) {
  const skill = getSkill(world, characterId);
  if (!skill) {
    return {
      passed: false,
      score: 0,
      issues: [{
        type: "knowledge_boundary",
        description: `Unknown character: ${characterId}`,
        suggestion: "Create a Character Skill first."
      }]
    };
  }

  const boundary = checkBoundary(world, characterId, reply);
  const issues = [...boundary.issues];
  const lowerReply = reply.toLowerCase();

  for (const term of MODERN_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|\\W)${escaped}(?=\\W|$)`, "i");
    if (pattern.test(reply)) {
      issues.push({
        type: "modern_term",
        description: `Reply contains modern term: ${term}`,
        suggestion: "Replace with setting-appropriate wording."
      });
    }
  }

  const cueTerms = [
    ...(skill.voiceCues ?? []),
    ...skill.voice
  ];
  const hasVoice = cueTerms.length === 0 || cueTerms.some((marker) => {
    const normalized = String(marker).toLowerCase();
    return lowerReply.includes(normalized);
  });
  if (!hasVoice) {
    issues.push({
      type: "voice_drift",
      description: "Reply does not show any configured voice marker.",
      suggestion: `Add a trace of the role voice: ${cueTerms.join(" / ")}.`
    });
  }

  const score = Math.max(0, 1 - issues.length * 0.25);
  return { passed: issues.length === 0, score, issues };
}

function draftReply(skill, scene) {
  const voice = skill.voice[0] ?? "bounded";
  const article = /^[aeiou]/i.test(voice) ? "an" : "a";
  return `${skill.name} gives ${article} ${voice} response about "${scene.topic}" while staying within current-stage knowledge.`;
}

function makeStateDelta(speaker, scene) {
  return {
    conflictIntensityChange: 1,
    relationshipChanges: [{
      source: speaker,
      target: "scene",
      change: `Tension around ${scene.topic} increased.`
    }],
    newClues: [`${speaker} revealed pressure around ${scene.topic}.`],
    memoryUpdates: [{
      characterId: speaker,
      memory: `${speaker} took a position during ${scene.sceneId}.`
    }]
  };
}

async function appendJsonl(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const previous = existsSync(path) ? await readFile(path, "utf8") : "";
  await writeFile(path, `${previous}${JSON.stringify(value)}\n`, "utf8");
}

async function simulateScene(world, scene, stateDir) {
  const sceneStore = new SceneStateStore(stateDir);
  let sceneState = await sceneStore.load(scene);
  const startingTurn = sceneState.currentTurn;
  const turns = [];
  for (let offset = 1; offset <= scene.maxTurns; offset += 1) {
    const turn = startingTurn + offset;
    const { speaker, reason } = chooseSpeaker(world, scene, turns);
    const skill = getSkill(world, speaker);
    if (!skill) throw new Error(`Missing skill for participant: ${speaker}`);

    const content = draftReply(skill, scene);
    const consistency = reviewReply(world, speaker, content);
    const stateDelta = makeStateDelta(speaker, scene);
    sceneState = applyStateDelta(sceneState, stateDelta, turn);
    await sceneStore.save(sceneState);
    const turnLog = { turn, speaker, reason, content, consistency, stateDelta };
    turns.push(turnLog);

    await appendJsonl(join(stateDir, "turn_logs.jsonl"), {
      sceneId: scene.sceneId,
      ...turnLog
    });
  }

  const result = {
    sceneId: scene.sceneId,
    setting: scene.setting,
    topic: scene.topic,
    turns,
    finalState: sceneState,
    summary: `${scene.setting} completed ${turns.length} simulated turns around "${scene.topic}".`
  };

  await saveJson(join(stateDir, "last_scene_result.json"), result);
  await saveJson(join(stateDir, "last_trace.json"), {
    kind: "scene_simulation",
    worldFacts: world.facts.length,
    skills: world.skills.map((skill) => skill.characterId),
    input: scene,
    output: result
  });

  return result;
}

async function llmSimulateScene(world, scene, stateDir, worldStore) {
  const sceneStore = new SceneStateStore(stateDir);
  let sceneState = await sceneStore.load(scene);
  const startingTurn = sceneState.currentTurn;
  const turns = [];
  const memoryManager = createMemoryManager({ worldStore });
  const sessionId = scene.sceneId;

  for (let offset = 1; offset <= scene.maxTurns; offset += 1) {
    const turn = startingTurn + offset;
    const { speaker, reason } = chooseSpeaker(world, scene, turns);
    const skill = getSkill(world, speaker);
    if (!skill) throw new Error(`Missing skill for participant: ${speaker}`);
    const worldFacts = world.facts.filter((fact) => fact.characters?.includes(speaker));

    const memoryContext = await memoryManager.getContextSummary(speaker, sessionId);

    const draft = await llmDraftSceneReply({
      characterSkill: skill,
      worldFacts,
      scene,
      sceneState,
      recentTurns: turns.map((item) => ({
        turn: item.turn,
        speaker: item.speaker,
        content: item.content
      })),
      memoryContext
    });
    const content = draft.content ?? "";
    const consistency = reviewReply(world, speaker, content);
    const llmConsistency = await llmReviewReply({
      characterSkill: skill,
      reply: content,
      worldFacts,
      scene
    });
    const stateDelta = {
      ...makeStateDelta(speaker, scene),
      newClues: [
        ...makeStateDelta(speaker, scene).newClues,
        ...(draft.stateHints ?? [])
      ]
    };
    sceneState = applyStateDelta(sceneState, stateDelta, turn);
    await sceneStore.save(sceneState);

    await memoryManager.remember(speaker, {
      content: `${speaker} said: "${content}" during ${scene.sceneId}`,
      importance: 2,
      source: "scene_simulation",
      sceneId: scene.sceneId
    }, sessionId);

    const turnLog = {
      turn,
      speaker,
      reason,
      content,
      generationStrategy: draft.strategy ?? "",
      consistency,
      llmConsistency,
      stateDelta
    };
    turns.push(turnLog);
    await appendJsonl(join(stateDir, "llm_turn_logs.jsonl"), {
      sceneId: scene.sceneId,
      ...turnLog
    });
  }

  const result = {
    sceneId: scene.sceneId,
    setting: scene.setting,
    topic: scene.topic,
    turns,
    finalState: sceneState,
    summary: `${scene.setting} completed ${turns.length} LLM-generated turns around "${scene.topic}".`
  };

  await saveJson(join(stateDir, "last_llm_scene_result.json"), result);
  await saveJson(join(stateDir, "last_llm_trace.json"), {
    kind: "llm_scene_simulation",
    worldFacts: world.facts.length,
    skills: world.skills.map((skill) => skill.characterId),
    input: scene,
    output: result
  });

  return result;
}

async function main() {
  await loadDotEnv();
  const [command, ...args] = process.argv.slice(2);
  const worldPath = option(args, "--world", DEFAULT_WORLD);
  const stateDir = option(args, "--state-dir", DEFAULT_STATE_DIR);

  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }

  const store = createWorldStore({ worldPath });

  if (command === "demo") {
    const world = await store.load();
    const scene = await loadJson("examples/qingyu-like/scene-court-conflict.json");
    console.log(JSON.stringify(await simulateScene(world, scene, DEFAULT_STATE_DIR), null, 2));
    return;
  }

  if (command === "sync-world") {
    const inputPath = args[0] ?? worldPath;
    const input = await loadJson(inputPath);
    console.log(JSON.stringify(await store.upsertWorld(input), null, 2));
    return;
  }

  if (command === "ingest-document") {
    const path = args[0];
    if (!path) throw new Error("ingest-document requires a text path.");
    const sourceId = option(args, "--source-id", path.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase());
    const maxChunks = Number(option(args, "--max-chunks", "5"));
    const extracted = await ingestDocument({ path, sourceId, maxChunks });
    const persisted = await store.upsertWorld(extracted.world);
    console.log(JSON.stringify({
      sourceId: extracted.sourceId,
      chunksProcessed: extracted.chunksProcessed,
      ...persisted
    }, null, 2));
    return;
  }

  if (command === "refine-skill") {
    const characterId = positionalArgs(args)[0];
    if (!characterId) throw new Error("refine-skill requires a character id.");
    const existingSkill = await store.getSkill(characterId);
    if (!existingSkill) throw new Error(`Unknown character: ${characterId}`);
    const facts = await store.factsForCharacter(characterId);
    const refinedSkill = await llmRefineCharacterSkill({ characterId, existingSkill, facts });
    const persisted = await store.upsertWorld({ facts: [], skills: [refinedSkill] });
    console.log(JSON.stringify({ refinedSkill, ...persisted }, null, 2));
    return;
  }

  const world = await store.load();

  if (command === "query-world") {
    const query = positionalArgs(args).join(" ");
    console.log(JSON.stringify({ query, facts: await store.searchFacts(query) }, null, 2));
    return;
  }

  if (command === "export-skill") {
    const characterId = args[0];
    const skill = await store.getSkill(characterId);
    if (!skill) throw new Error(`Unknown character: ${characterId}`);
    console.log(skillToMarkdown(skill));
    return;
  }

  if (command === "check-boundary") {
    const [characterId, ...claimParts] = positionalArgs(args);
    const claim = claimParts.join(" ");
    console.log(JSON.stringify(checkBoundary(world, characterId, claim), null, 2));
    return;
  }

  if (command === "review-reply") {
    const [characterId, ...replyParts] = positionalArgs(args);
    const reply = replyParts.join(" ");
    console.log(JSON.stringify(reviewReply(world, characterId, reply), null, 2));
    return;
  }

  if (command === "llm-review-reply") {
    const [characterId, ...replyParts] = positionalArgs(args);
    const reply = replyParts.join(" ");
    const skill = getSkill(world, characterId);
    if (!skill) throw new Error(`Unknown character: ${characterId}`);
    const worldFacts = world.facts.filter((fact) => fact.characters?.includes(characterId));
    console.log(JSON.stringify(await llmReviewReply({
      characterSkill: skill,
      reply,
      worldFacts
    }), null, 2));
    return;
  }

  if (command === "simulate-scene") {
    const scenePath = args[0];
    const scene = await loadJson(scenePath);
    console.log(JSON.stringify(await simulateScene(world, scene, stateDir), null, 2));
    return;
  }

  if (command === "llm-validate-scene") {
    const scenePath = args[0];
    const scene = await loadJson(scenePath);
    const result = await simulateScene(world, scene, stateDir);
    const llmReports = [];
    for (const turn of result.turns) {
      const skill = getSkill(world, turn.speaker);
      const worldFacts = world.facts.filter((fact) => fact.characters?.includes(turn.speaker));
      llmReports.push({
        turn: turn.turn,
        speaker: turn.speaker,
        report: await llmReviewReply({
          characterSkill: skill,
          reply: turn.content,
          worldFacts,
          scene
        })
      });
    }
    const output = {
      scene: result,
      llmReports
    };
    await saveJson(join(stateDir, "last_llm_validation.json"), output);
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (command === "llm-simulate-scene") {
    const scenePath = args[0];
    const scene = await loadJson(scenePath);
    console.log(JSON.stringify(await llmSimulateScene(world, scene, stateDir, store), null, 2));
    return;
  }

  if (command === "show-scene-state") {
    const sceneId = args[0];
    const path = join(stateDir, "scenes", `${sceneId}.json`);
    if (!existsSync(path)) throw new Error(`Scene state not found: ${sceneId}`);
    console.log(await readFile(path, "utf8"));
    return;
  }

  if (command === "reset-scene-state") {
    const scenePath = args[0];
    const scene = await loadJson(scenePath);
    const store = new SceneStateStore(stateDir);
    console.log(JSON.stringify(await store.reset(scene), null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
