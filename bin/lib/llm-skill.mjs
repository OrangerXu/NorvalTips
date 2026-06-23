import { chatCompletion, getLlmConfig, safeJsonParse } from "./openai-compatible.mjs";

export function buildSkillRefinementMessages({ characterId, existingSkill, facts }) {
  return [
    {
      role: "system",
      content: [
        "You are NovelTips Character Skill Builder.",
        "Build one reusable Character Skill from accumulated narrative facts.",
        "Preserve canonical ids and fact references.",
        "Do not treat traits, abilities, or policies as character aliases.",
        "Do not invent secrets or relationships unsupported by the supplied facts.",
        "Return strict JSON only."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        characterId,
        existingSkill,
        facts,
        outputSchema: {
          characterId: "must equal input characterId",
          name: "canonical display name",
          aliases: ["alternate names or titles only"],
          identity: ["roles and social identity"],
          voice: ["stable voice traits"],
          voiceCues: ["words, constructions, or rhetorical habits"],
          values: ["stable values inferred from evidence"],
          behaviorPolicy: { context_name: "concrete response strategy" },
          knownFacts: ["supplied fact ids known to the character"],
          unknownFacts: ["supplied fact ids hidden from the character"],
          relationships: { other_character_id: "evidence-based relation" },
          forbidden: ["behaviors or disclosures inconsistent with evidence"]
        }
      }, null, 2)
    }
  ];
}

export async function llmRefineCharacterSkill({ characterId, existingSkill, facts, env = process.env }) {
  const config = getLlmConfig(env);
  const content = await chatCompletion({
    ...config,
    temperature: 0.2,
    responseFormat: { type: "json_object" },
    messages: buildSkillRefinementMessages({ characterId, existingSkill, facts })
  });
  const result = safeJsonParse(content);
  return {
    ...result,
    characterId,
    knownFacts: result.knownFacts ?? existingSkill?.knownFacts ?? [],
    unknownFacts: result.unknownFacts ?? existingSkill?.unknownFacts ?? []
  };
}

