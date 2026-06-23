import { chatCompletion, getLlmConfig, safeJsonParse } from "./openai-compatible.mjs";

export function buildConsistencyJudgeMessages({ characterSkill, reply, worldFacts = [], scene }) {
  return [
    {
      role: "system",
      content: [
        "You are NovelTips Consistency Judge.",
        "Review a fictional character reply for long-form narrative consistency.",
        "Return strict JSON only.",
        "Use these dimensions: voice_style, knowledge_boundary, relationship_consistency, world_rule, behavior_policy.",
        "Do not rewrite the whole reply unless needed; focus on diagnosis."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        characterSkill,
        worldFacts,
        scene,
        reply,
        outputSchema: {
          passed: "boolean",
          score: "number 0-1",
          issues: [
            {
              type: "voice_style | knowledge_boundary | relationship_consistency | world_rule | behavior_policy",
              severity: "low | medium | high",
              description: "string",
              suggestion: "string"
            }
          ],
          revisedReply: "string or empty string"
        }
      }, null, 2)
    }
  ];
}

export async function llmReviewReply({ characterSkill, reply, worldFacts, scene, env = process.env }) {
  const config = getLlmConfig(env);
  const content = await chatCompletion({
    ...config,
    temperature: 0.1,
    responseFormat: { type: "json_object" },
    messages: buildConsistencyJudgeMessages({
      characterSkill,
      reply,
      worldFacts,
      scene
    })
  });
  return safeJsonParse(content);
}

