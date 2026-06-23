# Scene Simulation

Use this skill for multi-character plot simulation.

Required inputs:

- scene setting
- story stage
- participants
- initial conflict
- max turns

For each turn:

1. select next speaker using authority, relevance, conflict pressure, and recent turns
2. load the speaker Character Skill
3. query world facts and knowledge permissions
4. generate a bounded reply
5. run consistency review
6. emit State Delta

Never treat scene simulation as free-form group chat.

