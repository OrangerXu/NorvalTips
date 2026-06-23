import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function createSceneState(scene) {
  return {
    sceneId: scene.sceneId,
    currentTurn: 0,
    currentStage: scene.currentStage,
    setting: scene.setting,
    topic: scene.topic,
    conflictIntensity: 0,
    relationshipState: {},
    clues: [],
    characterMemories: {},
    participants: scene.participants,
    status: "active",
    updatedAt: new Date(0).toISOString()
  };
}

export function applyStateDelta(state, delta, turn) {
  const next = structuredClone(state);
  next.currentTurn = turn;
  next.conflictIntensity = Math.max(
    0,
    next.conflictIntensity + (delta.conflictIntensityChange ?? 0)
  );

  for (const change of delta.relationshipChanges ?? []) {
    const key = `${change.source}->${change.target}`;
    const history = next.relationshipState[key] ?? [];
    history.push({ turn, change: change.change });
    next.relationshipState[key] = history;
  }

  for (const clue of delta.newClues ?? []) {
    if (!next.clues.includes(clue)) next.clues.push(clue);
  }

  for (const update of delta.memoryUpdates ?? []) {
    const memories = next.characterMemories[update.characterId] ?? [];
    memories.push({ turn, content: update.memory });
    next.characterMemories[update.characterId] = memories;
  }

  next.updatedAt = new Date().toISOString();
  return next;
}

export class SceneStateStore {
  constructor(stateDir) {
    this.stateDir = stateDir;
  }

  pathFor(sceneId) {
    return join(this.stateDir, "scenes", `${sceneId}.json`);
  }

  async load(scene) {
    const path = this.pathFor(scene.sceneId);
    if (!existsSync(path)) return createSceneState(scene);
    return JSON.parse(await readFile(path, "utf8"));
  }

  async save(state) {
    const path = this.pathFor(state.sceneId);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    return path;
  }

  async reset(scene) {
    const state = createSceneState(scene);
    await this.save(state);
    return state;
  }
}

