# Real LLM Validation

NovelTips supports OpenAI-compatible model endpoints through environment variables.

## Configure

Create a local `.env` file or export variables in your shell. Do not commit secrets.

```bash
NOVELTIPS_API_KEY=your-key
NOVELTIPS_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
NOVELTIPS_MODEL=mimo-v2.5-pro
```

Available Mimo models include:

- `mimo-v2.5-pro`
- `mimo-v2.5`
- `mimo-v2-pro`
- `mimo-v2-omni`

## Validate One Reply

```bash
node bin/novaltips.mjs llm-review-reply fan_xian "I know emperor_final_plan"
```

Expected behavior:

- the LLM judge returns JSON
- `passed` should be false or include a high-severity knowledge-boundary issue
- the report should suggest rewriting as suspicion, evasion, or uncertainty

## Validate A Scene

```bash
node bin/novaltips.mjs llm-validate-scene examples/qingyu-like/scene-court-conflict.json
```

This writes:

```text
.novaltips/state/last_llm_validation.json
```

## Generate And Review A Scene

`llm-validate-scene` reviews the deterministic local simulation. For commercial demos, use `llm-simulate-scene` so the model writes concrete dialogue first and then NovelTips reviews each turn:

```bash
node bin/novaltips.mjs llm-simulate-scene examples/qingyu-like/scene-court-conflict.json
```

This writes:

```text
.novaltips/state/last_llm_scene_result.json
.novaltips/state/last_llm_trace.json
.novaltips/state/llm_turn_logs.jsonl
```

Expected behavior:

- each turn contains concrete in-character dialogue
- each turn includes `generationStrategy`
- local consistency and LLM consistency reports are both included
- state deltas and memory updates are persisted

## Local Safety

The CLI never writes the API key to disk. It only reads credentials from environment variables.

For CI or offline work, use:

```bash
node --test test/*.test.mjs
```

These tests validate request shaping, JSON parsing, local consistency checks, Skill export, and scene trace persistence without sending data to external services.
