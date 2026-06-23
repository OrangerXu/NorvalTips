export type Visibility = "public" | "reader_only" | "known_to_character" | "future";

export interface WorldFact {
  id: string;
  kind: "character" | "relation" | "event" | "faction" | "rule" | "secret";
  summary: string;
  stage?: string;
  visibility: Visibility;
  characters?: string[];
}

export interface CharacterSkill {
  characterId: string;
  name: string;
  aliases?: string[];
  identity: string[];
  voice: string[];
  voiceCues?: string[];
  values: string[];
  behaviorPolicy: Record<string, string>;
  knownFacts: string[];
  unknownFacts: string[];
  relationships: Record<string, string>;
  forbidden: string[];
}

export interface SceneInput {
  sceneId: string;
  setting: string;
  topic: string;
  currentStage: string;
  participants: string[];
  initialConflict: string;
  maxTurns: number;
}

export interface TurnLog {
  turn: number;
  speaker: string;
  reason: string;
  content: string;
  consistency: ConsistencyReport;
  stateDelta: StateDelta;
}

export interface StateDelta {
  conflictIntensityChange: number;
  relationshipChanges: Array<{
    source: string;
    target: string;
    change: string;
  }>;
  newClues: string[];
  memoryUpdates: Array<{
    characterId: string;
    memory: string;
  }>;
}

export interface ConsistencyIssue {
  type:
    | "voice_drift"
    | "knowledge_boundary"
    | "relationship_conflict"
    | "world_rule_conflict"
    | "modern_term"
    | "behavior_policy";
  description: string;
  suggestion: string;
}

export interface ConsistencyReport {
  passed: boolean;
  score: number;
  issues: ConsistencyIssue[];
}

export interface WorldState {
  facts: WorldFact[];
  skills: CharacterSkill[];
}
