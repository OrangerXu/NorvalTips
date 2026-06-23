# NovelTips Workflows

## 1. Chapter Review

Goal: check a draft chapter before publication.

Input:

- chapter text
- current story stage
- key characters

Steps:

1. extract mentioned characters, events, and claims
2. query world facts
3. check knowledge boundaries
4. check voice drift for important dialogue
5. emit continuity report

Output:

- blocking issues
- warnings
- suggested revision
- evidence facts

## 0. Document Ingestion

Goal: turn novel text into durable narrative state.

Steps:

1. split by chapter headings and bounded windows
2. extract facts and sparse Character Skills with strict JSON
3. merge by stable ids
4. normalize missing fields and character facts
5. upsert into JSON or Neo4j WorldStore
6. refine important Character Skills from accumulated evidence

## 2. Character Skill Export

Goal: create a reusable IP interaction package.

Input:

- character id

Steps:

1. query character facts and relations
2. collect known and unknown facts
3. collect voice and behavior policy
4. export Markdown/YAML skill

Output:

- Character Skill package

## 3. Scene Simulation

Goal: simulate a multi-character scene with traceable state.

Input:

- scene setting
- participants
- current stage
- initial conflict
- max turns

Steps:

1. select next speaker
2. draft bounded reply
3. review consistency
4. emit state delta
5. append turn log
6. apply State Delta to durable Scene State

Output:

- scene result
- turn logs
- state delta
- trace

Use `show-scene-state` to inspect the settled result. Use `reset-scene-state` before running a clean branch.

## 4. Branch Exploration

Goal: compare multiple plot paths.

Process:

1. duplicate scene input
2. alter one premise
3. run simulation
4. compare state deltas and warnings

This maps naturally onto Pi's tree-shaped session history.
