function allText(value) {
  return JSON.stringify(value).toLowerCase();
}

function getSkill(world, characterId) {
  return world.skills.find((skill) => skill.characterId === characterId);
}

export function chooseSpeaker(world, scene, turns) {
  const scores = scene.participants.map((id) => {
    const skill = getSkill(world, id);
    const authority = id === "emperor" ? 3 : id === "chen_pingping" ? 2 : 1;
    const alreadySpoke = turns.filter((turn) => turn.speaker === id).length;
    const topicHit = skill
      ? allText(skill).includes(scene.topic.toLowerCase().split(" ")[0]) ? 1 : 0
      : 0;
    const aliases = [id, skill?.name, ...(skill?.aliases ?? [])]
      .filter(Boolean)
      .map((item) => String(item).toLowerCase());
    const lastSpokenTurn = turns
      .filter((turn) => turn.speaker === id)
      .at(-1)?.turn ?? 0;
    const hasPendingMention = turns.some((turn) => {
      if (turn.turn <= lastSpokenTurn || turn.speaker === id) return false;
      const content = turn.content.toLowerCase();
      return aliases.some((alias) => content.includes(alias));
    });
    const directMentionBoost = hasPendingMention
      ? alreadySpoke === 0 ? 6 : 3
      : 0;
    return {
      id,
      score: authority + topicHit + directMentionBoost - alreadySpoke * 2.25
    };
  });
  scores.sort((a, b) => b.score - a.score);
  const chosen = scores[0];
  return {
    speaker: chosen.id,
    score: chosen.score,
    candidates: scores,
    reason: `Selected by authority, relevance, pending mentions, and turn pressure score ${chosen.score.toFixed(2)}.`
  };
}

