import { ShortTermMemory } from "./memory-shortterm.mjs";
import { LongTermMemory } from "./memory-longterm.mjs";

export class MemoryManager {
  constructor({ worldStore, shortTermMemory }) {
    this.worldStore = worldStore;
    this.shortTerm = shortTermMemory ?? new ShortTermMemory();
    this.longTerm = new LongTermMemory(worldStore);
  }

  async remember(characterId, memory, sessionId) {
    const importance = memory.importance ?? 3;

    if (sessionId && importance < 3) {
      this.shortTerm.addEntry(sessionId, {
        characterId,
        content: memory.content,
        importance,
        emotionalValence: memory.emotionalValence ?? 0,
        source: memory.source ?? "conversation"
      });
      return { layer: "short-term", importance };
    }

    const record = await this.longTerm.addMemory(characterId, memory);
    return { layer: "long-term", id: record.id, importance };
  }

  async recall(characterId, { query = "", sessionId, limit = 10 } = {}) {
    const results = {
      shortTerm: [],
      longTerm: [],
      semantic: null
    };

    if (sessionId) {
      results.shortTerm = this.shortTerm.getRecent(sessionId, limit);
    }

    results.longTerm = await this.longTerm.retrieveMemories(characterId, {
      query,
      limit,
      minImportance: 3
    });

    results.semantic = await this.worldStore.getSkill(characterId);

    return results;
  }

  mergeMemories(results) {
    const merged = [];
    const seen = new Set();

    if (results.semantic) {
      merged.push({
        type: "semantic",
        content: formatSkillAsMemory(results.semantic)
      });
    }

    for (const mem of results.longTerm) {
      const key = mem.content;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({
          type: "long-term",
          ...mem
        });
      }
    }

    for (const entry of results.shortTerm) {
      const key = entry.content ?? entry.text;
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push({
          type: "short-term",
          ...entry
        });
      }
    }

    return merged;
  }

  async getContextSummary(characterId, sessionId) {
    const results = await this.recall(characterId, { sessionId });
    const merged = this.mergeMemories(results);

    const sections = [];

    const semantic = merged.filter((m) => m.type === "semantic");
    if (semantic.length) {
      sections.push(`[Character Profile]\n${semantic[0].content}`);
    }

    const longTerm = merged.filter((m) => m.type === "long-term");
    if (longTerm.length) {
      const items = longTerm.map((m) => `- ${m.content}`).join("\n");
      sections.push(`[Important Memories]\n${items}`);
    }

    const shortTerm = merged.filter((m) => m.type === "short-term");
    if (shortTerm.length) {
      const items = shortTerm
        .map((m) => `- ${m.content ?? m.text ?? JSON.stringify(m)}`)
        .join("\n");
      sections.push(`[Recent Context]\n${items}`);
    }

    if (sessionId) {
      const summary = this.shortTerm.getSummary(sessionId);
      if (summary) {
        sections.push(`[Session Summary]\n${summary}`);
      }
    }

    return sections.join("\n\n");
  }

  clearSession(sessionId) {
    this.shortTerm.clear(sessionId);
  }
}

function formatSkillAsMemory(skill) {
  const parts = [];

  if (skill.name) parts.push(`Name: ${skill.name}`);
  if (skill.identity?.length) parts.push(`Identity: ${skill.identity.join(", ")}`);
  if (skill.voice?.length) parts.push(`Voice: ${skill.voice.join(", ")}`);
  if (skill.values?.length) parts.push(`Values: ${skill.values.join(", ")}`);
  if (skill.relationships && Object.keys(skill.relationships).length) {
    const rels = Object.entries(skill.relationships)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
    parts.push(`Relationships: ${rels}`);
  }
  if (skill.knownFacts?.length) parts.push(`Known facts: ${skill.knownFacts.length} items`);
  if (skill.behaviorPolicy && Object.keys(skill.behaviorPolicy).length) {
    const policies = Object.entries(skill.behaviorPolicy)
      .map(([k, v]) => `${k} → ${v}`)
      .join("; ");
    parts.push(`Behavior: ${policies}`);
  }

  return parts.join("\n");
}

export function createMemoryManager({ worldStore, env } = {}) {
  const shortTermMemory = new ShortTermMemory();
  return new MemoryManager({ worldStore, shortTermMemory });
}
