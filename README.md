# NovelTips on Pi

NovelTips is a Pi-based narrative agent workspace for long-form web novels and IP development. It focuses on four hard problems in serialized fiction:

- long-form setting management
- character consistency
- spoiler and knowledge-boundary control
- multi-character plot simulation

This rewrite treats Pi as the agent runtime and interaction shell, while NovelTips owns the narrative state model. The current repository includes a runnable no-dependency CLI so the narrative workflow can be demonstrated before the Pi extension is installed.

## Architecture

```text
Pi Runtime
  - models
  - sessions
  - skills
  - extensions
  - prompt templates

NovelTips Extension
  - world graph query
  - character skill export
  - knowledge boundary check
  - consistency review
  - scene simulation

Narrative State
  - Neo4j: world facts, factions, relations, event timeline
  - JSON/SQLite: scene state, turn logs, traces
  - Markdown/YAML: Character Skills
```

## Why Pi

Pi gives the project a lightweight agent runtime: model switching, skills, prompt templates, command-style workflows, tree-shaped sessions, and extension hooks. NovelTips uses these capabilities to expose story-specific tools rather than building another generic chat app.

## Core Design

NovelTips follows a simple split:

```text
Neo4j manages the world.
Character Skill manages the role.
Pi runs the agent workflow.
LLM produces the final language.
```

World facts such as factions, event timelines, character relations, and knowledge permissions are stored as structured state. Character expression is distilled into reusable skills containing identity, voice, known facts, unknown facts, behavior policy, and forbidden actions.

## Example Commands

These are the intended Pi commands/tools exposed by the extension:

```text
/novel.query-world fan_xian chen_pingping
/novel.export-skill fan_xian
/novel.check-boundary fan_xian "庆帝早已布好所有局面"
/novel.review-reply fan_xian reply.md
/novel.simulate-scene examples/qingyu-like/scene-court-conflict.json
```

The same workflow can be run locally with Node:

```bash
node bin/novaltips.mjs query-world fan_xian
node bin/novaltips.mjs export-skill fan_xian
node bin/novaltips.mjs check-boundary fan_xian emperor_final_plan
node bin/novaltips.mjs llm-review-reply fan_xian "I know emperor_final_plan"
node bin/novaltips.mjs simulate-scene examples/qingyu-like/scene-court-conflict.json
node bin/novaltips.mjs llm-validate-scene examples/qingyu-like/scene-court-conflict.json
node bin/novaltips.mjs llm-simulate-scene examples/qingyu-like/scene-court-conflict.json
node bin/novaltips.mjs show-scene-state court_conflict_001
node bin/novaltips.mjs reset-scene-state examples/qingyu-like/scene-court-conflict.json
node bin/novaltips.mjs ingest-document examples/qingyu-like/sample-chapter.txt --source-id court_sample --max-chunks 1
node bin/novaltips.mjs refine-skill young_lord_fan
node --test test/*.test.mjs
```

OpenAI-compatible LLM endpoints are configured through environment variables:

```bash
NOVELTIPS_API_KEY=...
NOVELTIPS_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
NOVELTIPS_MODEL=mimo-v2.5-pro
```

Never commit API keys. The CLI reads them only from the process environment.

## World Store

JSON is the default local/test store:

```bash
NOVELTIPS_WORLD_STORE=json
```

To use Neo4j over its HTTP Transaction API:

```bash
NOVELTIPS_WORLD_STORE=neo4j
NEO4J_HTTP_URL=http://localhost:7474
NEO4J_DATABASE=neo4j
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password
```

Sync an existing JSON world into the active store:

```bash
node bin/novaltips.mjs sync-world examples/qingyu-like/world.json
```

The ingestion pipeline deliberately separates two model tasks:

```text
document extraction -> durable facts and sparse skills
skill refinement -> evidence-based Character Skill
```

This separation reduces the chance that a single chunk invents a complete personality without enough evidence.

Simulation writes state into `.novaltips/state/`:

```text
.novaltips/state/
  last_scene_result.json
  last_trace.json
  turn_logs.jsonl
```

This is the key InkOS-inspired upgrade: generation is not ephemeral. Every scene has state, turn logs, state deltas, and a replayable trace.

State deltas are applied after every turn. Re-running a scene continues from the persisted turn number and feeds accumulated conflict, clues, relationships, and character memories back into LLM generation.

## Project Layout

```text
src/
  index.ts                 Pi extension entry
  core/
    types.ts               Narrative state types
    store.ts               JSON state store
  tools/
    queryWorld.ts
    exportSkill.ts
    checkBoundary.ts
    reviewConsistency.ts
    simulateScene.ts
skills/
  chapter-review.md
  character-consistency.md
  scene-simulation.md
examples/
  qingyu-like/
    world.json
    scene-court-conflict.json
bin/
  novaltips.mjs             runnable local workspace CLI
test/
  novaltips.test.mjs        regression tests
docs/
  architecture.md
  commercialization.md
```

## Commercial MVP Scope

The commercializable MVP is:

1. durable world state
2. exportable Character Skills
3. knowledge-boundary review
4. scene simulation with turn-level trace
5. tests that protect against prompt/model regressions

See [docs/architecture.md](docs/architecture.md) and [docs/commercialization.md](docs/commercialization.md).

For real model validation with OpenAI-compatible providers, see [docs/llm-validation.md](docs/llm-validation.md).
