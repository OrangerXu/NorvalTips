import { chatCompletion, getLlmConfig, safeJsonParse } from "./openai-compatible.mjs";

export function buildEvaluationMessages({ characterSkill, question, response, worldFacts = [] }) {
  return [
    {
      role: "system",
      content: [
        "You are NovelTips Quality Evaluator.",
        "Evaluate a fictional character response across 5 dimensions.",
        "Return strict JSON only.",
        "Be objective and specific in scoring."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        characterSkill,
        question,
        response,
        worldFacts,
        dimensions: {
          characterConsistency: {
            weight: 0.25,
            description: "Does the response match the character's voice, values, and behavior policy?"
          },
          logicalConsistency: {
            weight: 0.20,
            description: "Is the response internally consistent and logically sound?"
          },
          knowledgeBoundary: {
            weight: 0.20,
            description: "Does the response respect knownFacts and avoid unknownFacts?"
          },
          emotionalAuthenticity: {
            weight: 0.15,
            description: "Are the emotions genuine and appropriate to the context?"
          },
          depthComplexity: {
            weight: 0.20,
            description: "Does the response show nuanced thought and character depth?"
          }
        },
        outputSchema: {
          overallScore: "number 0-1, weighted average",
          dimensions: {
            characterConsistency: { score: "number 0-1", reasoning: "string" },
            logicalConsistency: { score: "number 0-1", reasoning: "string" },
            knowledgeBoundary: { score: "number 0-1", reasoning: "string" },
            emotionalAuthenticity: { score: "number 0-1", reasoning: "string" },
            depthComplexity: { score: "number 0-1", reasoning: "string" }
          },
          issues: ["string, specific issues found"],
          strengths: ["string, specific strengths noted"]
        }
      }, null, 2)
    }
  ];
}

export async function llmJudgeResponse({ characterSkill, question, response, worldFacts = [], env = process.env }) {
  const config = getLlmConfig(env);
  const content = await chatCompletion({
    ...config,
    temperature: 0.1,
    responseFormat: { type: "json_object" },
    messages: buildEvaluationMessages({ characterSkill, question, response, worldFacts })
  });
  return safeJsonParse(content);
}

export function generateStressQuestions(characterSkill) {
  const questions = [];

  if (characterSkill.unknownFacts?.length) {
    questions.push({
      type: "knowledge_boundary",
      question: `I heard something interesting about ${characterSkill.unknownFacts[0]}. Can you confirm this?`,
      expectedBehavior: "Should claim ignorance or deflect"
    });
  }

  if (characterSkill.relationships && Object.keys(characterSkill.relationships).length) {
    const [otherId, relation] = Object.entries(characterSkill.relationships)[0];
    questions.push({
      type: "relationship_probe",
      question: `Tell me about your relationship with ${otherId}. What do you really think of them?`,
      expectedBehavior: "Should reflect the documented relationship"
    });
  }

  questions.push({
    type: "moral_dilemma",
    question: "If you had to choose between your principles and saving someone you care about, what would you do?",
    expectedBehavior: "Should reflect character values and be internally consistent"
  });

  questions.push({
    type: "personality_pressure",
    question: "Everyone says you're wrong about this. Are you going to change your mind?",
    expectedBehavior: "Should maintain character voice and values under pressure"
  });

  if (characterSkill.voiceCues?.length) {
    questions.push({
      type: "modern_term_test",
      question: "That's totally sus, no cap. What's your take on this vibe check?",
      expectedBehavior: "Should stay in character without adopting modern slang"
    });
  }

  return questions;
}
