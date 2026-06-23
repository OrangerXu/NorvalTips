import { readFile } from "node:fs/promises";
import { JsonWorldStore } from "../core/store.js";
import { reviewConsistency } from "./reviewConsistency.js";
import type { SceneInput, StateDelta, TurnLog } from "../core/types.js";

function chooseSpeaker(
  participants: string[],
  turn: number,
  turns: TurnLog[] = [],
  skills: Array<{ characterId: string; name: string; aliases?: string[] }> = []
): { speaker: string; reason: string } {
  const scores = participants.map((id) => {
    const skill = skills.find((item) => item.characterId === id);
    const authority = id === "emperor" ? 3 : id === "chen_pingping" ? 2 : 1;
    const alreadySpoke = turns.filter((item) => item.speaker === id).length;
    const aliases = [id, skill?.name, ...(skill?.aliases ?? [])]
      .filter(Boolean)
      .map((item) => String(item).toLowerCase());
    const lastSpokenTurn = turns
      .filter((item) => item.speaker === id)
      .at(-1)?.turn ?? 0;
    const hasPendingMention = turns.some((item) => {
      if (item.turn <= lastSpokenTurn || item.speaker === id) return false;
      const content = item.content.toLowerCase();
      return aliases.some((alias) => content.includes(alias));
    });
    const directMentionBoost = hasPendingMention
      ? alreadySpoke === 0 ? 6 : 3
      : 0;
    return {
      id,
      score: authority + directMentionBoost - alreadySpoke * 2.25
    };
  });
  scores.sort((a, b) => b.score - a.score);
  const speaker = scores[0].id;
  return {
    speaker,
    reason: turn === 0 ? "Opening turn follows scene authority order." : `Selected by authority, mention, and turn pressure score ${scores[0].score.toFixed(2)}.`
  };
}

function draftReply(name: string, topic: string): string {
  return `${name} gives a bounded, probing reply about "${topic}" without exposing unknown facts.`;
}

function makeStateDelta(speaker: string): StateDelta {
  return {
    conflictIntensityChange: 1,
    relationshipChanges: [],
    newClues: [`${speaker}'s statement changes the pressure around the current topic.`],
    memoryUpdates: [
      {
        characterId: speaker,
        memory: `${speaker} took a position on the core topic in this scene.`
      }
    ]
  };
}

export async function simulateScene(worldPath: string, scene: SceneInput) {
  const store = new JsonWorldStore(worldPath);
  const world = await store.load();
  const turns: TurnLog[] = [];

  for (let index = 0; index < scene.maxTurns; index += 1) {
    const { speaker, reason } = chooseSpeaker(scene.participants, index, turns, world.skills);
    const skill = await store.getSkill(speaker);
    const speakerName = skill?.name ?? speaker;
    const content = draftReply(speakerName, scene.topic);
    const consistency = await reviewConsistency(worldPath, speaker, content);
    const stateDelta = makeStateDelta(speaker);

    turns.push({
      turn: index + 1,
      speaker,
      reason,
      content,
      consistency,
      stateDelta
    });
  }

  return {
    sceneId: scene.sceneId,
    setting: scene.setting,
    topic: scene.topic,
    turns,
    summary: `${scene.setting} completed ${turns.length} simulated turns around "${scene.topic}".`
  };
}

if (process.argv[1]?.endsWith("simulateScene.js")) {
  const scenePath = process.argv[2];
  const worldPath = "examples/qingyu-like/world.json";
  if (!scenePath) {
    console.error("Usage: node dist/tools/simulateScene.js <scene.json>");
    process.exit(1);
  }
  const raw = await readFile(scenePath, "utf8");
  const scene = JSON.parse(raw) as SceneInput;
  const result = await simulateScene(worldPath, scene);
  console.log(JSON.stringify(result, null, 2));
}
