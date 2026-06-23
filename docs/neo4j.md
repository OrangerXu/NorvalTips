# Neo4j Integration

NovelTips can use Neo4j through the HTTP Transaction API without an additional driver package.

## Configure

```bash
NOVELTIPS_WORLD_STORE=neo4j
NEO4J_HTTP_URL=http://localhost:7474
NEO4J_DATABASE=neo4j
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password
```

## Sync Demo Data

```bash
node bin/novaltips.mjs sync-world examples/qingyu-like/world.json
```

The adapter creates unique constraints for:

- `WorldFact.id`
- `CharacterSkill.characterId`

Payloads are stored as JSON strings while searchable fields such as kind, stage, visibility, and character ids are also stored as Neo4j properties.

## Production Follow-up

The current adapter is intentionally compact. A production deployment should add:

- connection retries and timeout policy
- batched `UNWIND` writes
- relationship nodes/edges instead of payload-only storage
- migrations and schema versioning
- tenant/workspace isolation
- encrypted secret management
