import { readFile } from "node:fs/promises";
import type { CharacterSkill, WorldFact, WorldState } from "./types.js";

export class JsonWorldStore {
  constructor(private readonly worldPath: string) {}

  async load(): Promise<WorldState> {
    const raw = await readFile(this.worldPath, "utf8");
    const parsed = JSON.parse(raw) as WorldState;
    return {
      facts: parsed.facts ?? [],
      skills: parsed.skills ?? []
    };
  }

  async factsForCharacter(characterId: string): Promise<WorldFact[]> {
    const world = await this.load();
    return world.facts.filter((fact) => fact.characters?.includes(characterId));
  }

  async getSkill(characterId: string): Promise<CharacterSkill | undefined> {
    const world = await this.load();
    return world.skills.find((skill) => skill.characterId === characterId);
  }

  async searchFacts(query: string): Promise<WorldFact[]> {
    const world = await this.load();
    const normalized = query.toLowerCase();
    return world.facts.filter((fact) => {
      const haystack = `${fact.id} ${fact.kind} ${fact.summary} ${(fact.characters ?? []).join(" ")}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }
}

