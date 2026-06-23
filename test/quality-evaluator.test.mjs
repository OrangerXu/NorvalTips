import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateStressQuestions, buildEvaluationMessages } from "../bin/lib/llm-judge.mjs";
import { QualityEvaluator } from "../bin/lib/quality-evaluator.mjs";

function createMockWorldStore(skills = {}, facts = []) {
  return {
    async getSkill(characterId) {
      return skills[characterId];
    },
    async factsForCharacter(characterId) {
      return facts.filter(f => f.characters?.includes(characterId));
    }
  };
}

test("generateStressQuestions produces expected question types", () => {
  const skill = {
    characterId: "test_char",
    voice: ["formal"],
    voiceCues: ["indeed", "perhaps"],
    values: ["honor"],
    unknownFacts: ["secret_plan"],
    relationships: { ally_char: "trusted ally" }
  };

  const questions = generateStressQuestions(skill);
  
  assert.ok(questions.length >= 4, "Should generate at least 4 questions");
  
  const types = questions.map(q => q.type);
  assert.ok(types.includes("knowledge_boundary"), "Should have knowledge_boundary test");
  assert.ok(types.includes("relationship_probe"), "Should have relationship_probe test");
  assert.ok(types.includes("moral_dilemma"), "Should have moral_dilemma test");
  assert.ok(types.includes("personality_pressure"), "Should have personality_pressure test");
  assert.ok(types.includes("modern_term_test"), "Should have modern_term_test when voiceCues exist");
});

test("generateStressQuestions handles minimal skill", () => {
  const skill = {
    characterId: "minimal_char"
  };

  const questions = generateStressQuestions(skill);
  assert.ok(questions.length >= 2, "Should generate at least 2 questions even with minimal skill");
  assert.ok(!questions.some(q => q.type === "knowledge_boundary"), "Should not have knowledge_boundary without unknownFacts");
  assert.ok(!questions.some(q => q.type === "relationship_probe"), "Should not have relationship_probe without relationships");
  assert.ok(!questions.some(q => q.type === "modern_term_test"), "Should not have modern_term_test without voiceCues");
});

test("buildEvaluationMessages creates proper structure", () => {
  const messages = buildEvaluationMessages({
    characterSkill: { characterId: "test" },
    question: "test question",
    response: "test response",
    worldFacts: []
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[1].role, "user");
  assert.ok(messages[1].content.includes("characterConsistency"));
  assert.ok(messages[1].content.includes("overallScore"));
});

test("QualityEvaluator calculateSummary computes correct stats", () => {
  const evaluator = new QualityEvaluator({ worldStore: {} });
  
  const results = [
    { evaluation: { overallScore: 0.8 } },
    { evaluation: { overallScore: 0.5 } },
    { evaluation: { overallScore: 0.9 } }
  ];

  const summary = evaluator.calculateSummary(results);
  
  assert.equal(summary.totalTests, 3);
  assert.equal(summary.passed, 2);
  assert.equal(summary.failed, 1);
  assert.ok(Math.abs(summary.averageScore - 0.733) < 0.01);
  assert.ok(Math.abs(summary.passRate - 2/3) < 0.01);
});

test("QualityEvaluator saveBaseline and loadLatestBaseline roundtrip", async () => {
  const dir = await mkdtemp(join(tmpdir(), "novaltips-baseline-"));
  const evaluator = new QualityEvaluator({ worldStore: {}, baselineDir: dir });

  const evaluation = {
    overallScore: 0.85,
    dimensions: {
      characterConsistency: { score: 0.9, reasoning: "good" }
    }
  };

  await evaluator.saveBaseline("test_char", evaluation, "abc123");
  const loaded = await evaluator.loadLatestBaseline("test_char");

  assert.ok(loaded);
  assert.equal(loaded.characterId, "test_char");
  assert.equal(loaded.commitHash, "abc123");
  assert.equal(loaded.evaluation.overallScore, 0.85);
});

test("QualityEvaluator loadLatestBaseline returns null when no baseline exists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "novaltips-baseline-empty-"));
  const evaluator = new QualityEvaluator({ worldStore: {}, baselineDir: dir });

  const loaded = await evaluator.loadLatestBaseline("nonexistent");
  assert.equal(loaded, null);
});

test("QualityEvaluator compareWithBaseline detects regressions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "novaltips-baseline-compare-"));
  const evaluator = new QualityEvaluator({ worldStore: {}, baselineDir: dir });

  await evaluator.saveBaseline("test_char", {
    overallScore: 0.8,
    dimensions: {
      characterConsistency: { score: 0.9, reasoning: "good" },
      logicalConsistency: { score: 0.8, reasoning: "good" },
      knowledgeBoundary: { score: 0.7, reasoning: "ok" },
      emotionalAuthenticity: { score: 0.8, reasoning: "good" },
      depthComplexity: { score: 0.75, reasoning: "ok" }
    }
  }, "v1");

  const newEvaluation = {
    overallScore: 0.6,
    dimensions: {
      characterConsistency: { score: 0.5, reasoning: "regression" },
      logicalConsistency: { score: 0.95, reasoning: "improved" },
      knowledgeBoundary: { score: 0.7, reasoning: "same" },
      emotionalAuthenticity: { score: 0.8, reasoning: "same" },
      depthComplexity: { score: 0.75, reasoning: "same" }
    }
  };

  const result = await evaluator.compareWithBaseline("test_char", newEvaluation, 0.1);

  assert.ok(result.hasBaseline);
  assert.equal(result.passed, false);
  assert.equal(result.regressions.length, 1);
  assert.equal(result.regressions[0].dimension, "characterConsistency");
  assert.equal(result.improved.length, 1);
  assert.equal(result.improved[0].dimension, "logicalConsistency");
});

test("QualityEvaluator compareWithBaseline passes when no regressions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "novaltips-baseline-pass-"));
  const evaluator = new QualityEvaluator({ worldStore: {}, baselineDir: dir });

  await evaluator.saveBaseline("test_char", {
    overallScore: 0.7,
    dimensions: {
      characterConsistency: { score: 0.7, reasoning: "ok" },
      logicalConsistency: { score: 0.7, reasoning: "ok" },
      knowledgeBoundary: { score: 0.7, reasoning: "ok" },
      emotionalAuthenticity: { score: 0.7, reasoning: "ok" },
      depthComplexity: { score: 0.7, reasoning: "ok" }
    }
  }, "v1");

  const newEvaluation = {
    overallScore: 0.8,
    dimensions: {
      characterConsistency: { score: 0.8, reasoning: "improved" },
      logicalConsistency: { score: 0.75, reasoning: "slightly better" },
      knowledgeBoundary: { score: 0.7, reasoning: "same" },
      emotionalAuthenticity: { score: 0.7, reasoning: "same" },
      depthComplexity: { score: 0.7, reasoning: "same" }
    }
  };

  const result = await evaluator.compareWithBaseline("test_char", newEvaluation, 0.1);

  assert.ok(result.hasBaseline);
  assert.equal(result.passed, true);
  assert.equal(result.regressions.length, 0);
});

test("QualityEvaluator compareWithBaseline handles no baseline", async () => {
  const dir = await mkdtemp(join(tmpdir(), "novaltips-baseline-nobase-"));
  const evaluator = new QualityEvaluator({ worldStore: {}, baselineDir: dir });

  const result = await evaluator.compareWithBaseline("test_char", { overallScore: 0.8 });

  assert.equal(result.hasBaseline, false);
  assert.deepEqual(result.regressions, []);
  assert.deepEqual(result.improved, []);
});

test("QualityEvaluator generateReport produces summary", () => {
  const evaluator = new QualityEvaluator({ worldStore: {} });

  const results = [
    {
      characterId: "char1",
      evaluation: {
        overallScore: 0.8,
        dimensions: { characterConsistency: { score: 0.9 } },
        issues: ["minor issue"],
        strengths: ["good voice"]
      }
    },
    {
      characterId: "char2",
      evaluation: {
        overallScore: 0.5,
        dimensions: { characterConsistency: { score: 0.4 } },
        issues: ["major issue"],
        strengths: []
      }
    }
  ];

  const report = evaluator.generateReport(results);

  assert.equal(report.summary.totalCharacters, 2);
  assert.equal(report.summary.passed, 1);
  assert.equal(report.summary.failed, 1);
  assert.ok(Math.abs(report.summary.averageScore - 0.65) < 0.01);
  assert.equal(report.details.length, 2);
  assert.equal(report.details[0].characterId, "char1");
  assert.equal(report.details[0].passed, true);
  assert.equal(report.details[1].characterId, "char2");
  assert.equal(report.details[1].passed, false);
});

test("QualityEvaluator generateReport handles empty results", () => {
  const evaluator = new QualityEvaluator({ worldStore: {} });

  const report = evaluator.generateReport([]);

  assert.equal(report.summary, "No results to report");
  assert.deepEqual(report.details, []);
});
