import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChatCompletionRequest,
  getLlmConfig,
  safeJsonParse
} from "../bin/lib/openai-compatible.mjs";
import { buildConsistencyJudgeMessages } from "../bin/lib/llm-review.mjs";
import { buildSceneReplyMessages } from "../bin/lib/llm-scene.mjs";
import { buildSkillRefinementMessages } from "../bin/lib/llm-skill.mjs";

test("reads OpenAI-compatible LLM config from env", () => {
  const config = getLlmConfig({
    NOVELTIPS_API_KEY: "test-key",
    NOVELTIPS_BASE_URL: "https://example.test/v1",
    NOVELTIPS_MODEL: "mimo-v2.5-pro"
  });
  assert.equal(config.apiKey, "test-key");
  assert.equal(config.baseUrl, "https://example.test/v1");
  assert.equal(config.model, "mimo-v2.5-pro");
});

test("builds chat completion request", () => {
  const request = buildChatCompletionRequest({
    model: "mimo-v2.5-pro",
    temperature: 0.1,
    responseFormat: { type: "json_object" },
    messages: [{ role: "user", content: "hi" }]
  });
  assert.equal(request.model, "mimo-v2.5-pro");
  assert.equal(request.response_format.type, "json_object");
  assert.equal(request.messages[0].role, "user");
});

test("extracts JSON object from non-strict model text", () => {
  const parsed = safeJsonParse("Here is the result:\n{\"passed\":true,\"score\":1}");
  assert.equal(parsed.passed, true);
  assert.equal(parsed.score, 1);
});

test("builds consistency judge messages with schema", () => {
  const messages = buildConsistencyJudgeMessages({
    characterSkill: { characterId: "fan_xian", name: "Fan", voice: ["witty"] },
    reply: "A bounded reply.",
    worldFacts: [],
    scene: { sceneId: "s1" }
  });
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /strict JSON/);
  assert.match(messages[1].content, /outputSchema/);
});

test("builds scene writer messages with concrete dialogue requirement", () => {
  const messages = buildSceneReplyMessages({
    characterSkill: { characterId: "fan_xian", name: "Fan", voice: ["witty"] },
    worldFacts: [],
    scene: { sceneId: "s1", topic: "court funding" },
    sceneState: { conflictIntensity: 2 },
    recentTurns: []
  });
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /Scene Writer/);
  assert.match(messages[1].content, /concrete dialogue/);
  assert.match(messages[1].content, /outputSchema/);
});

test("builds Character Skill refinement messages", () => {
  const messages = buildSkillRefinementMessages({
    characterId: "fan",
    existingSkill: { characterId: "fan", name: "Young Lord Fan" },
    facts: [{ id: "event_1", summary: "Fan used humor to deflect." }]
  });
  assert.match(messages[0].content, /Character Skill Builder/);
  assert.match(messages[1].content, /behaviorPolicy/);
  assert.match(messages[1].content, /must equal input characterId/);
});
