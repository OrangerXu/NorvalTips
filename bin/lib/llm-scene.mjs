import { chatCompletion, getLlmConfig, safeJsonParse } from "./openai-compatible.mjs";

export function buildSceneReplyMessages({
  characterSkill,
  worldFacts = [],
  scene,
  sceneState,
  recentTurns = [],
  memoryContext = ""
}) {
  const systemParts = [
    "You are NovalTips Scene Writer.",
    "Write one in-character reply for a long-form political/intrigue scene.",
    "Use the Character Skill as hard constraints.",
    "Respect knownFacts and unknownFacts. Never reveal unknown facts.",
    "Return strict JSON only."
  ];

  if (memoryContext) {
    systemParts.push("", "Use the following memory context to inform your response:");
    systemParts.push(memoryContext);
  }

  return [
    {
      role: "system",
      content: systemParts.join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        scene,
        sceneState,
        characterSkill,
        worldFacts,
        recentTurns,
        requirements: [
          "write concrete dialogue, not a meta description",
          "stay within current-stage knowledge",
          "show the role voice through wording and strategy",
          "avoid reader-only spoilers",
          "keep it concise: 1-3 sentences"
        ],
        outputSchema: {
          content: "string, concrete in-character reply",
          strategy: "string, why this role replies this way",
          stateHints: ["string, possible scene-state changes"]
        }
      }, null, 2)
    }
  ];
}

export async function llmDraftSceneReply({
  characterSkill,
  worldFacts,
  scene,
  sceneState,
  recentTurns,
  memoryContext = "",
  env = process.env
}) {
  const config = getLlmConfig(env);
  const content = await chatCompletion({
    ...config,
    temperature: 0.5,
    responseFormat: { type: "json_object" },
    messages: buildSceneReplyMessages({
      characterSkill,
      worldFacts,
      scene,
      sceneState,
      recentTurns,
      memoryContext
    })
  });
  return safeJsonParse(content);
}
