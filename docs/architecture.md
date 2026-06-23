# NovelTips Architecture

## Runtime Split

```text
Pi Runtime
  -> skills, templates, sessions, model switching

NovelTips Extension
  -> story-specific tools

Narrative State
  -> world graph, character skills, scene traces
```

## WorldStore Interface

NovelTips uses one logical store contract:

- `load()`
- `searchFacts(query)`
- `factsForCharacter(characterId)`
- `getSkill(characterId)`
- `upsertWorld(world)`

Implementations:

- `JsonWorldStore`: local development and deterministic tests
- `Neo4jHttpWorldStore`: production graph persistence through Neo4j HTTP Transaction API

## Ingestion Pipeline

```text
TXT/Markdown
  -> chapter-aware chunking
  -> LLM fact extraction
  -> stable-id merge
  -> schema normalization
  -> WorldStore upsert
  -> per-character Skill refinement
```

## State Objects

### World Fact

Durable fact about the story world.

```json
{
  "id": "secret_emperor_final_plan",
  "kind": "secret",
  "visibility": "reader_only",
  "characters": ["emperor", "fan_xian"]
}
```

### Character Skill

Reusable character package for interaction.

```json
{
  "characterId": "fan_xian",
  "voice": ["probing", "witty", "ironic"],
  "knownFacts": ["rel_fan_chen"],
  "unknownFacts": ["emperor_final_plan"]
}
```

### Scene Trace

Replayable execution record.

```json
{
  "kind": "scene_simulation",
  "input": {},
  "output": {
    "turns": []
  }
}
```

### Scene State

Durable state that survives multiple simulation runs.

```json
{
  "sceneId": "court_conflict_001",
  "currentTurn": 3,
  "conflictIntensity": 3,
  "relationshipState": {},
  "clues": [],
  "characterMemories": {}
}
```

## Why This Is Agentic

The system is not a fixed prompt workflow. Runtime decisions use:

- goals: review chapter, answer as character, simulate scene
- state: world graph, story stage, scene state
- tools: query, boundary check, consistency review
- policies: Character Skill, behavior rules
- feedback: reports and state deltas
