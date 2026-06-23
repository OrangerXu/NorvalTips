import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { llmJudgeResponse, generateStressQuestions } from "./llm-judge.mjs";
import { llmDraftSceneReply } from "./llm-scene.mjs";

export class QualityEvaluator {
  constructor({ worldStore, baselineDir = "baselines" }) {
    this.worldStore = worldStore;
    this.baselineDir = baselineDir;
  }

  async evaluateResponse(characterId, question, response) {
    const characterSkill = await this.worldStore.getSkill(characterId);
    if (!characterSkill) {
      throw new Error(`Character skill not found: ${characterId}`);
    }

    const worldFacts = await this.worldStore.factsForCharacter(characterId);
    return llmJudgeResponse({ characterSkill, question, response, worldFacts });
  }

  async stressTest(characterId) {
    const characterSkill = await this.worldStore.getSkill(characterId);
    if (!characterSkill) {
      throw new Error(`Character skill not found: ${characterId}`);
    }

    const questions = generateStressQuestions(characterSkill);
    const results = [];

    for (const { type, question, expectedBehavior } of questions) {
      const worldFacts = await this.worldStore.factsForCharacter(characterId);
      
      const reply = await llmDraftSceneReply({
        characterSkill,
        worldFacts,
        scene: { context: "stress_test", question },
        sceneState: {},
        recentTurns: []
      });

      const evaluation = await llmJudgeResponse({
        characterSkill,
        question,
        response: reply.content || reply.reply || JSON.stringify(reply),
        worldFacts
      });

      results.push({
        type,
        question,
        expectedBehavior,
        response: reply.content || reply.reply || JSON.stringify(reply),
        evaluation
      });
    }

    return {
      characterId,
      timestamp: new Date().toISOString(),
      results,
      summary: this.calculateSummary(results)
    };
  }

  calculateSummary(results) {
    const scores = results.map(r => r.evaluation?.overallScore ?? 0);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const passed = results.filter(r => (r.evaluation?.overallScore ?? 0) >= 0.6).length;
    
    return {
      averageScore: avg,
      totalTests: results.length,
      passed,
      failed: results.length - passed,
      passRate: passed / results.length
    };
  }

  async saveBaseline(characterId, evaluation, commitHash) {
    await mkdir(this.baselineDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${characterId}_${timestamp}_${commitHash || "local"}.json`;
    const filepath = join(this.baselineDir, filename);
    
    const baseline = {
      characterId,
      commitHash,
      timestamp,
      evaluation
    };

    await writeFile(filepath, JSON.stringify(baseline, null, 2) + "\n", "utf8");
    return filepath;
  }

  async loadLatestBaseline(characterId) {
    try {
      const files = await readdir(this.baselineDir);
      const matching = files
        .filter(f => f.startsWith(characterId) && f.endsWith(".json"))
        .sort()
        .reverse();

      if (matching.length === 0) return null;

      const content = await readFile(join(this.baselineDir, matching[0]), "utf8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async compareWithBaseline(characterId, newEvaluation, threshold = 0.1) {
    const baseline = await this.loadLatestBaseline(characterId);
    if (!baseline) {
      return { hasBaseline: false, regressions: [], improved: [] };
    }

    const regressions = [];
    const improved = [];
    const dimensions = ["characterConsistency", "logicalConsistency", "knowledgeBoundary", "emotionalAuthenticity", "depthComplexity"];

    for (const dim of dimensions) {
      const oldScore = baseline.evaluation?.dimensions?.[dim]?.score ?? 0;
      const newScore = newEvaluation?.dimensions?.[dim]?.score ?? 0;
      const diff = newScore - oldScore;

      if (diff < -threshold) {
        regressions.push({ dimension: dim, oldScore, newScore, diff });
      } else if (diff > threshold) {
        improved.push({ dimension: dim, oldScore, newScore, diff });
      }
    }

    const oldOverall = baseline.evaluation?.overallScore ?? 0;
    const newOverall = newEvaluation?.overallScore ?? 0;

    return {
      hasBaseline: true,
      baselineTimestamp: baseline.timestamp,
      baselineCommit: baseline.commitHash,
      oldOverall,
      newOverall,
      overallDiff: newOverall - oldOverall,
      regressions,
      improved,
      passed: regressions.length === 0
    };
  }

  generateReport(results) {
    if (!results || results.length === 0) {
      return { summary: "No results to report", details: [] };
    }

    const summaries = results.map(r => ({
      characterId: r.characterId,
      overallScore: r.evaluation?.overallScore ?? 0,
      passed: (r.evaluation?.overallScore ?? 0) >= 0.6,
      dimensions: r.evaluation?.dimensions ?? {},
      issues: r.evaluation?.issues ?? [],
      strengths: r.evaluation?.strengths ?? []
    }));

    const avgScore = summaries.reduce((a, b) => a + b.overallScore, 0) / summaries.length;
    const passedCount = summaries.filter(s => s.passed).length;

    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalCharacters: results.length,
        averageScore: avgScore,
        passed: passedCount,
        failed: results.length - passedCount
      },
      details: summaries
    };
  }
}
