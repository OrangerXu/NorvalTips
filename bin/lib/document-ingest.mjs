import { readFile } from "node:fs/promises";
import { chatCompletion, getLlmConfig, safeJsonParse } from "./openai-compatible.mjs";

const CHAPTER_PATTERN = /^(?:chapter\s+\d+|#{1,3}\s+.+|\u7b2c[\u4e00-\u9fa5\d]+[\u7ae0\u56de])/gim;

export function chunkDocument(text, { chunkSize = 5000, overlap = 400 } = {}) {
  const matches = [...text.matchAll(CHAPTER_PATTERN)];
  const sections = [];
  if (matches.length) {
    for (let index = 0; index < matches.length; index += 1) {
      const start = matches[index].index;
      const end = matches[index + 1]?.index ?? text.length;
      sections.push(text.slice(start, end).trim());
    }
  } else {
    sections.push(text.trim());
  }

  const chunks = [];
  for (const section of sections) {
    if (section.length <= chunkSize) {
      if (section) chunks.push(section);
      continue;
    }
    let start = 0;
    while (start < section.length) {
      const end = Math.min(section.length, start + chunkSize);
      chunks.push(section.slice(start, end));
      if (end === section.length) break;
      start = Math.max(0, end - overlap);
    }
  }
  return chunks;
}

export function buildExtractionMessages({ chunk, sourceId, chunkIndex }) {
  return [
    {
      role: "system",
      content: [
        "You are NovelTips Narrative Extractor.",
        "Extract durable story facts and reusable character skills from fiction text.",
        "Return strict JSON only. Do not invent facts not supported by the text.",
        "CharacterSkill.name MUST be the canonical character display name found in the text.",
        "CharacterSkill.aliases MUST contain only alternate names or titles for that character, never traits or abilities.",
        "Emit one character WorldFact for every Character Skill.",
        "Use stable snake_case character ids consistently across facts and skills."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        sourceId,
        chunkIndex,
        text: chunk,
        outputSchema: {
          facts: [{
            id: "stable snake_case id",
            kind: "character | relation | event | faction | rule | secret",
            summary: "string",
            stage: "string or empty",
            visibility: "public | reader_only | known_to_character | future",
            characters: ["character ids"]
          }],
          skills: [{
            characterId: "stable snake_case id",
            name: "canonical character display name from the text",
            aliases: ["alternate character names or titles only"],
            identity: ["string"],
            voice: ["string"],
            voiceCues: ["string"],
            values: ["string"],
            behaviorPolicy: {},
            knownFacts: ["fact ids"],
            unknownFacts: ["fact ids"],
            relationships: {},
            forbidden: ["string"]
          }]
        }
      }, null, 2)
    }
  ];
}

export function mergeExtractionResults(results) {
  const facts = new Map();
  const skills = new Map();
  for (const result of results) {
    for (const fact of result.facts ?? []) facts.set(fact.id, fact);
    for (const skill of result.skills ?? []) {
      const previous = skills.get(skill.characterId);
      if (!previous) {
        skills.set(skill.characterId, skill);
        continue;
      }
      skills.set(skill.characterId, {
        ...previous,
        ...skill,
        aliases: [...new Set([...(previous.aliases ?? []), ...(skill.aliases ?? [])])],
        identity: [...new Set([...(previous.identity ?? []), ...(skill.identity ?? [])])],
        voice: [...new Set([...(previous.voice ?? []), ...(skill.voice ?? [])])],
        voiceCues: [...new Set([...(previous.voiceCues ?? []), ...(skill.voiceCues ?? [])])],
        values: [...new Set([...(previous.values ?? []), ...(skill.values ?? [])])],
        knownFacts: [...new Set([...(previous.knownFacts ?? []), ...(skill.knownFacts ?? [])])],
        unknownFacts: [...new Set([...(previous.unknownFacts ?? []), ...(skill.unknownFacts ?? [])])],
        forbidden: [...new Set([...(previous.forbidden ?? []), ...(skill.forbidden ?? [])])],
        behaviorPolicy: { ...(previous.behaviorPolicy ?? {}), ...(skill.behaviorPolicy ?? {}) },
        relationships: { ...(previous.relationships ?? {}), ...(skill.relationships ?? {}) }
      });
    }
  }
  return { facts: [...facts.values()], skills: [...skills.values()] };
}

export function normalizeExtractedWorld(world, sourceId = "source") {
  const facts = new Map((world.facts ?? []).map((fact) => [fact.id, fact]));
  const skills = [];
  for (const input of world.skills ?? []) {
    const skill = {
      characterId: input.characterId,
      name: input.name || input.characterId,
      aliases: input.aliases ?? [],
      identity: input.identity ?? [],
      voice: input.voice ?? [],
      voiceCues: input.voiceCues ?? [],
      values: input.values ?? [],
      behaviorPolicy: input.behaviorPolicy ?? {},
      knownFacts: input.knownFacts ?? [],
      unknownFacts: input.unknownFacts ?? [],
      relationships: input.relationships ?? {},
      forbidden: input.forbidden ?? []
    };
    skills.push(skill);
    const characterFactId = `character_${skill.characterId}`;
    const hasCharacterFact = [...facts.values()].some(
      (fact) => fact.kind === "character" && fact.characters?.includes(skill.characterId)
    );
    if (!hasCharacterFact) {
      facts.set(characterFactId, {
        id: characterFactId,
        kind: "character",
        summary: `${skill.name}: ${skill.identity.join(", ") || "fictional character"}`,
        stage: sourceId,
        visibility: "public",
        characters: [skill.characterId]
      });
    }
  }
  return { facts: [...facts.values()], skills };
}

export async function ingestDocument({ path, sourceId, maxChunks = 5, env = process.env }) {
  const text = await readFile(path, "utf8");
  const chunks = chunkDocument(text).slice(0, maxChunks);
  const config = getLlmConfig(env);
  const results = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const content = await chatCompletion({
      ...config,
      temperature: 0.1,
      responseFormat: { type: "json_object" },
      messages: buildExtractionMessages({ chunk: chunks[index], sourceId, chunkIndex: index })
    });
    results.push(safeJsonParse(content));
  }
  return {
    sourceId,
    chunksProcessed: chunks.length,
    world: normalizeExtractedWorld(mergeExtractionResults(results), sourceId)
  };
}
