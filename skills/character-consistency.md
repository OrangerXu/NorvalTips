# Character Consistency Review

Use this skill when reviewing whether a character reply fits the current story state.

Check these dimensions:

- voice style: does the reply match the Character Skill?
- values: does it conflict with stable semantic memory?
- relationship: does it match the world graph relation?
- knowledge boundary: does it reveal unknown or future facts?
- world rules: does it use forbidden modern concepts or impossible facts?
- behavior policy: did the character choose an allowed response strategy?

Return a structured report with `passed`, `score`, `issues`, and `revision_suggestion`.

