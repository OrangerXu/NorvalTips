# NovelTips Agent Instructions

You are running NovelTips as a Pi extension for long-form narrative work.

Always separate:

- world facts: query the world graph or JSON state
- character expression: load the Character Skill
- scene state: read and update Scene State and Turn Log
- final prose: generate only after state and permissions are checked

Do not let a character use reader-only or future information. If a requested answer requires unknown information, respond through uncertainty, evasion, suspicion, or stage-appropriate inference.

For scene simulation, produce:

1. speaker decision
2. character response
3. consistency report
4. state delta
5. memory updates

