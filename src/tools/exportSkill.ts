import { JsonWorldStore } from "../core/store.js";

export async function exportSkill(worldPath: string, characterId: string) {
  const store = new JsonWorldStore(worldPath);
  const skill = await store.getSkill(characterId);
  if (!skill) {
    return {
      found: false,
      characterId,
      markdown: ""
    };
  }

  const markdown = [
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

  return {
    found: true,
    characterId,
    skill,
    markdown
  };
}
