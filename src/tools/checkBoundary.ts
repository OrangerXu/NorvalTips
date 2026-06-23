import { JsonWorldStore } from "../core/store.js";
import type { ConsistencyReport } from "../core/types.js";

export async function checkBoundary(
  worldPath: string,
  characterId: string,
  claim: string
): Promise<ConsistencyReport> {
  const store = new JsonWorldStore(worldPath);
  const skill = await store.getSkill(characterId);
  if (!skill) {
    return {
      passed: false,
      score: 0,
      issues: [
        {
          type: "knowledge_boundary",
          description: `Unknown character: ${characterId}`,
          suggestion: "Create or import a Character Skill before checking claims."
        }
      ]
    };
  }

  const hitUnknown = skill.unknownFacts.find((fact) => claim.includes(fact));
  if (hitUnknown) {
    return {
      passed: false,
      score: 0.2,
      issues: [
        {
          type: "knowledge_boundary",
          description: `${skill.name} should not know or confirm: ${hitUnknown}`,
          suggestion: "Rewrite as suspicion, evasion, or stage-appropriate uncertainty."
        }
      ]
    };
  }

  return {
    passed: true,
    score: 1,
    issues: []
  };
}

