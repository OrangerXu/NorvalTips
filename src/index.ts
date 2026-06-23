import { queryWorld } from "./tools/queryWorld.js";
import { exportSkill } from "./tools/exportSkill.js";
import { checkBoundary } from "./tools/checkBoundary.js";
import { reviewConsistency } from "./tools/reviewConsistency.js";
import { simulateScene } from "./tools/simulateScene.js";

export const novalTipsExtension = {
  name: "novaltips",
  description: "Narrative state, character consistency, and plot simulation tools for Pi.",
  tools: {
    queryWorld,
    exportSkill,
    checkBoundary,
    reviewConsistency,
    simulateScene
  }
};

export default novalTipsExtension;

