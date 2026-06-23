let _nextId = 1;

function generateId() {
  return `ltm_${Date.now()}_${_nextId++}`;
}

export class LongTermMemory {
  constructor(worldStore) {
    this.worldStore = worldStore;
    this.alpha = 0.5;
    this.beta = 0.3;
    this.gamma = 0.2;
  }

  async initSchema() {
    await this.worldStore.run(
      "CREATE CONSTRAINT memory_id IF NOT EXISTS FOR (m:Memory) REQUIRE m.id IS UNIQUE"
    );
    await this.worldStore.run(
      "CREATE INDEX memory_character IF NOT EXISTS FOR (m:Memory) ON (m.characterId)"
    );
    await this.worldStore.run(
      "CREATE INDEX memory_importance IF NOT EXISTS FOR (m:Memory) ON (m.importance)"
    );
    await this.worldStore.run(
      "CREATE INDEX memory_timestamp IF NOT EXISTS FOR (m:Memory) ON (m.timestamp)"
    );
  }

  async addMemory(characterId, memory) {
    const id = memory.id ?? generateId();
    const timestamp = memory.timestamp ?? Date.now();

    const record = {
      id,
      characterId,
      content: memory.content ?? "",
      timestamp,
      emotionalValence: clamp(memory.emotionalValence ?? 0, -1, 1),
      importance: clamp(memory.importance ?? 3, 1, 5),
      relatedCharacters: memory.relatedCharacters ?? [],
      source: memory.source ?? "unknown",
      sceneId: memory.sceneId ?? null
    };

    const searchText = [
      record.content,
      record.source,
      record.sceneId ?? "",
      ...record.relatedCharacters
    ]
      .join(" ")
      .toLowerCase();

    await this.worldStore.run(
      [
        "MERGE (m:Memory {id: $id})",
        "SET m.characterId = $characterId,",
        "    m.content = $content,",
        "    m.timestamp = $timestamp,",
        "    m.emotionalValence = $emotionalValence,",
        "    m.importance = $importance,",
        "    m.relatedCharacters = $relatedCharacters,",
        "    m.source = $source,",
        "    m.sceneId = $sceneId,",
        "    m.searchText = $searchText,",
        "    m.payload = $payload"
      ].join(" "),
      {
        id: record.id,
        characterId: record.characterId,
        content: record.content,
        timestamp: record.timestamp,
        emotionalValence: record.emotionalValence,
        importance: record.importance,
        relatedCharacters: record.relatedCharacters,
        source: record.source,
        sceneId: record.sceneId,
        searchText,
        payload: JSON.stringify(record)
      }
    );

    return record;
  }

  async retrieveMemories(characterId, { query = "", limit = 10, minImportance = 1 } = {}) {
    const rows = await this.worldStore.run(
      [
        "MATCH (m:Memory {characterId: $characterId})",
        "WHERE m.importance >= $minImportance",
        "RETURN m.payload AS payload",
        "ORDER BY m.timestamp DESC"
      ].join(" "),
      { characterId, minImportance }
    );

    const memories = rows.map((row) => JSON.parse(row.row[0] ?? row.row?.payload ?? "{}"));

    const scored = memories.map((mem) => ({
      memory: mem,
      score: this.computeScore(mem, query)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((entry) => entry.memory);
  }

  computeScore(memory, query) {
    const relevance = query ? computeRelevance(memory, query) : 0;
    const recency = computeRecency(memory.timestamp);
    const importance = (memory.importance - 1) / 4;

    return this.alpha * relevance + this.beta * recency + this.gamma * importance;
  }

  async getCharacterTimeline(characterId) {
    const rows = await this.worldStore.run(
      "MATCH (m:Memory {characterId: $characterId}) RETURN m.payload AS payload ORDER BY m.timestamp ASC",
      { characterId }
    );
    return rows.map((row) => JSON.parse(row.row[0] ?? row.row?.payload ?? "{}"));
  }

  async getRelatedCharacterMemories(characterId, relatedCharacterId) {
    const rows = await this.worldStore.run(
      [
        "MATCH (m:Memory {characterId: $characterId})",
        "WHERE $relatedCharacterId IN m.relatedCharacters",
        "RETURN m.payload AS payload",
        "ORDER BY m.timestamp DESC"
      ].join(" "),
      { characterId, relatedCharacterId }
    );
    return rows.map((row) => JSON.parse(row.row[0] ?? row.row?.payload ?? "{}"));
  }
}

function computeRelevance(memory, query) {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (queryTerms.length === 0) return 0;

  const text = [
    memory.content ?? "",
    memory.source ?? "",
    memory.sceneId ?? "",
    ...(memory.relatedCharacters ?? [])
  ]
    .join(" ")
    .toLowerCase();

  let matches = 0;
  for (const term of queryTerms) {
    if (text.includes(term)) matches++;
  }
  return matches / queryTerms.length;
}

function computeRecency(timestamp) {
  const now = Date.now();
  const ageMs = now - timestamp;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.exp(-ageDays / 30);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
