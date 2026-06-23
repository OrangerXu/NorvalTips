import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class JsonWorldStore {
  constructor(path) {
    this.path = path;
  }

  async load() {
    const raw = await readFile(this.path, "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
    return {
      facts: parsed.facts ?? [],
      skills: parsed.skills ?? []
    };
  }

  async searchFacts(query) {
    const world = await this.load();
    const normalized = query.toLowerCase();
    return world.facts.filter((fact) => JSON.stringify(fact).toLowerCase().includes(normalized));
  }

  async factsForCharacter(characterId) {
    const world = await this.load();
    return world.facts.filter((fact) => fact.characters?.includes(characterId));
  }

  async getSkill(characterId) {
    const world = await this.load();
    return world.skills.find((skill) => skill.characterId === characterId);
  }

  async upsertWorld(input) {
    const world = await this.load();
    const factMap = new Map(world.facts.map((fact) => [fact.id, fact]));
    const skillMap = new Map(world.skills.map((skill) => [skill.characterId, skill]));
    for (const fact of input.facts ?? []) factMap.set(fact.id, fact);
    for (const skill of input.skills ?? []) skillMap.set(skill.characterId, skill);
    const next = {
      facts: [...factMap.values()],
      skills: [...skillMap.values()]
    };
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return {
      factsUpserted: input.facts?.length ?? 0,
      skillsUpserted: input.skills?.length ?? 0
    };
  }
}

export function getNeo4jConfig(env = process.env) {
  return {
    httpUrl: env.NEO4J_HTTP_URL ?? "http://localhost:7474",
    database: env.NEO4J_DATABASE ?? "neo4j",
    username: env.NEO4J_USERNAME ?? "neo4j",
    password: env.NEO4J_PASSWORD ?? "password"
  };
}

export class Neo4jHttpWorldStore {
  constructor(config = getNeo4jConfig()) {
    this.config = config;
  }

  async run(statement, parameters = {}) {
    const { httpUrl, database, username, password } = this.config;
    const endpoint = `${httpUrl.replace(/\/$/, "")}/db/${database}/tx/commit`;
    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ statements: [{ statement, parameters }] })
    });
    if (!response.ok) {
      throw new Error(`Neo4j HTTP request failed: ${response.status} ${await response.text()}`);
    }
    const payload = await response.json();
    if (payload.errors?.length) {
      throw new Error(`Neo4j query failed: ${payload.errors.map((error) => error.message).join("; ")}`);
    }
    return payload.results?.[0]?.data ?? [];
  }

  async initSchema() {
    await this.run("CREATE CONSTRAINT world_fact_id IF NOT EXISTS FOR (f:WorldFact) REQUIRE f.id IS UNIQUE");
    await this.run("CREATE CONSTRAINT character_skill_id IF NOT EXISTS FOR (s:CharacterSkill) REQUIRE s.characterId IS UNIQUE");
  }

  async load() {
    const factRows = await this.run("MATCH (f:WorldFact) RETURN f.payload AS payload ORDER BY f.id");
    const skillRows = await this.run("MATCH (s:CharacterSkill) RETURN s.payload AS payload ORDER BY s.characterId");
    return {
      facts: factRows.map((row) => JSON.parse(row.row[0])),
      skills: skillRows.map((row) => JSON.parse(row.row[0]))
    };
  }

  async searchFacts(query) {
    const rows = await this.run(
      "MATCH (f:WorldFact) WHERE toLower(f.searchText) CONTAINS toLower($query) RETURN f.payload AS payload ORDER BY f.id",
      { query }
    );
    return rows.map((row) => JSON.parse(row.row[0]));
  }

  async factsForCharacter(characterId) {
    const rows = await this.run(
      "MATCH (f:WorldFact) WHERE $characterId IN coalesce(f.characters, []) RETURN f.payload AS payload ORDER BY f.id",
      { characterId }
    );
    return rows.map((row) => JSON.parse(row.row[0]));
  }

  async getSkill(characterId) {
    const rows = await this.run(
      "MATCH (s:CharacterSkill {characterId: $characterId}) RETURN s.payload AS payload LIMIT 1",
      { characterId }
    );
    return rows.length ? JSON.parse(rows[0].row[0]) : undefined;
  }

  async upsertWorld(input) {
    await this.initSchema();
    for (const fact of input.facts ?? []) {
      await this.run(
        [
          "MERGE (f:WorldFact {id: $id})",
          "SET f.kind = $kind, f.stage = $stage, f.visibility = $visibility,",
          "f.characters = $characters, f.searchText = $searchText, f.payload = $payload"
        ].join(" "),
        {
          id: fact.id,
          kind: fact.kind,
          stage: fact.stage ?? "",
          visibility: fact.visibility ?? "public",
          characters: fact.characters ?? [],
          searchText: JSON.stringify(fact).toLowerCase(),
          payload: JSON.stringify(fact)
        }
      );
    }
    for (const skill of input.skills ?? []) {
      await this.run(
        "MERGE (s:CharacterSkill {characterId: $characterId}) SET s.name = $name, s.payload = $payload",
        {
          characterId: skill.characterId,
          name: skill.name,
          payload: JSON.stringify(skill)
        }
      );
    }
    return {
      factsUpserted: input.facts?.length ?? 0,
      skillsUpserted: input.skills?.length ?? 0
    };
  }
}

export function createWorldStore({ worldPath, env = process.env } = {}) {
  const type = (env.NOVELTIPS_WORLD_STORE ?? "json").toLowerCase();
  if (type === "neo4j") return new Neo4jHttpWorldStore(getNeo4jConfig(env));
  return new JsonWorldStore(worldPath ?? "examples/qingyu-like/world.json");
}
