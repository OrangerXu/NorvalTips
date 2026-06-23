import { checkBoundary } from "./checkBoundary.js";
import { JsonWorldStore } from "../core/store.js";
import type { ConsistencyIssue, ConsistencyReport } from "../core/types.js";

const MODERN_TERMS = ["phone", "internet", "AI", "algorithm", "product manager"];

export async function reviewConsistency(
  worldPath: string,
  characterId: string,
  reply: string
): Promise<ConsistencyReport> {
  const store = new JsonWorldStore(worldPath);
  const skill = await store.getSkill(characterId);
  const issues: ConsistencyIssue[] = [];

  if (!skill) {
    return {
      passed: false,
      score: 0,
      issues: [
        {
          type: "knowledge_boundary",
          description: `Unknown character: ${characterId}`,
          suggestion: "Create a Character Skill first."
        }
      ]
    };
  }

  const boundary = await checkBoundary(worldPath, characterId, reply);
  issues.push(...boundary.issues);

  for (const term of MODERN_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|\\W)${escaped}(?=\\W|$)`, "i");
    if (pattern.test(reply)) {
      issues.push({
        type: "modern_term",
        description: `Reply contains modern term: ${term}`,
        suggestion: "Replace with setting-appropriate wording."
      });
    }
  }

  const cueTerms = [
    ...(skill.voiceCues ?? []),
    ...skill.voice
  ];
  const lowerReply = reply.toLowerCase();
  const missingVoice = cueTerms.length > 0 && !cueTerms.some((marker) => lowerReply.includes(String(marker).toLowerCase()));
  if (missingVoice) {
    issues.push({
      type: "voice_drift",
      description: "Reply does not show any configured voice marker.",
      suggestion: `Add a trace of the role voice: ${cueTerms.join(" / ")}.`
    });
  }

  const score = Math.max(0, 1 - issues.length * 0.25);
  return {
    passed: issues.length === 0,
    score,
    issues
  };
}
