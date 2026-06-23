import { JsonWorldStore } from "../core/store.js";

export async function queryWorld(worldPath: string, query: string) {
  const store = new JsonWorldStore(worldPath);
  const facts = await store.searchFacts(query);
  return {
    query,
    count: facts.length,
    facts
  };
}

