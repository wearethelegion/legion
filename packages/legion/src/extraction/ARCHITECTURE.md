# Infinite Conversation Pipeline -- Architecture Reference

## 1. Overview

The Infinite Conversation system is a graph-based context persistence pipeline that replaces lossy conversation summarization with structured entity extraction. Every conversation turn is processed by Claude Haiku to extract entities (concepts, decisions, preferences, topics, code references) and stores them in a Neo4j knowledge graph. On subsequent sessions, this graph context is recalled and injected into the system prompt, giving the assistant persistent "memory" across sessions.

### Why It Exists

Traditional context management relies on summarization, which loses specificity -- previous decisions, user preferences, and technical context are compressed into vague summaries. The Infinite Conversation system preserves granular structured data: what was decided, what was rejected, why, what the user prefers, and what code was discussed. This enables the assistant to recall exact decisions and preferences rather than approximations.

### Key Architectural Decisions

- **Haiku structured outputs** (not LangExtract) -- Uses `zodOutputFormat()` with Claude Haiku for constrained decoding. The response is guaranteed to match the `TurnExtraction` Zod schema. No post-hoc parsing or validation failures.
- **SQLite buffer then gRPC then Neo4j** -- Extraction results are buffered locally in SQLite (WAL mode) before draining to the LEGION gRPC server. This decouples the extraction latency from the conversation flow and provides crash recovery.
- **Append-only versioning** -- Events (ConversationTurn, Decision, SessionBridge) always CREATE new nodes. Entities (Concept, Topic, Preference, CodeEntity) always MERGE (deduplicate). Preferences use version counters so the latest value wins without losing history.

---

## 2. Architecture Diagram

```
WRITE PATH (Extraction)
========================

User turn completes
      |
      v
prompt.ts (main loop, lines 720-747)
      |  Extracts user/assistant text from messages
      |  Dynamic import("../extraction") with .catch(() => {})
      v
ExtractionHook.onTurnComplete()  [hook.ts]
      |  Fires via queueMicrotask -- NEVER blocks
      |  Checks: isLegionAvailable(), ANTHROPIC_API_KEY, shouldSkipExtraction()
      v
extractTurn()  [extract.ts]
      |  Calls claude-haiku-4-5-20251001
      |  Uses zodOutputFormat(TurnExtraction) for constrained decoding
      |  Never throws -- returns EMPTY_EXTRACTION on any error
      v
ExtractionBuffer.insert()  [buffer.ts]
      |  bun:sqlite, WAL mode
      |  Table: extraction_buffer
      |  Status: pending -> sending -> sent | failed
      |  Dedup: UNIQUE(session_id, turn_number)
      v
ExtractionDrain  [drain.ts]
      |  3-second interval background loop
      |  Processes pending items, then retryable failures (max 5 retries)
      |  Each item sent individually via gRPC
      |  mapToProto() converts CLI field names to proto field names
      v
gRPC StoreExtraction  [legion-client/src/client.ts]
      |
      v
ConversationExtractionServicer  [grpc_server/servicers/]
      |  Single Neo4j transaction per request
      |  MERGE entities, CREATE events
      |  Duplicate detection: session_id + turn_number
      |  Name normalization, text truncation (500 chars)
      v
Neo4j Graph Database
      |  Constraints: 5 uniqueness constraints
      |  Indexes: 4 composite indexes


READ PATH (Context Recall)
==========================

Session start
      |
      v
SessionBootstrap.bootstrap()  [bootstrap.ts]
      |  gRPC GetUserProfile -> preferences, decisions, topics
      |  gRPC RecallContext -> active topics from graph traversal
      |  Returns "## Your Memory" system prompt section
      |    - User Preferences
      |    - Active Work
      |    - Recent Decisions
      v
System prompt injection

Per user message
      |
      v
ExtractionRecall.recallForMessage()  [recall.ts]
      |  Regex entity extraction (no LLM call, <300ms budget)
      |    - PascalCase, camelCase identifiers
      |    - File paths, quoted strings
      |    - 33 known tech terms
      |  Max 10 entities extracted
      |  gRPC RecallContext -> context items from graph traversal
      |  Maps response types: decision/preference/topic/code_ref
      v
Returns "## Relevant Context from Prior Conversations" block

Context overflow
      |
      v
ContextMonitor.checkUsage()  [context-monitor.ts]
      |  Token counting: input + cache_read + cache_creation + output
      |  80% threshold triggers bridge construction
      v
SessionBridge.buildBridge()  [bridge.ts]
      |  Composes summary: active threads, open questions, next steps
      |  gRPC BuildSessionBridge -> SessionBridge node in graph
      v
Bridge persisted for next session pickup
```

---

## 3. Write Path (Extraction Pipeline)

### hook.ts -- Entry Point (82 lines)

The extraction hook is the entry point for the write path. `onTurnComplete()` fires asynchronously via `queueMicrotask` and never blocks the conversation flow.

**Precondition checks (before queueing):**
- `isLegionAvailable()` -- LEGION client must be initialized
- `process.env.ANTHROPIC_API_KEY` -- Haiku API key must be present
- `shouldSkipExtraction()` -- Turn must contain extractable content

**Inside the microtask:**
1. Calls `extractTurn()` with user message, assistant response, and session context
2. Checks if extraction produced any content (concepts, decisions, preferences, topics, or code_references)
3. If content exists, calls `ExtractionBuffer.insert()` to persist locally
4. All errors are caught and logged -- never propagated

### extract.ts -- Haiku Extraction Call (191 lines)

Calls `claude-haiku-4-5-20251001` with `zodOutputFormat(TurnExtraction)` for constrained structured output. The response is guaranteed to match the Zod schema via Anthropic's constrained decoding.

**Never throws.** Returns `EMPTY_EXTRACTION` on any error condition:
- Rate limits (`Anthropic.RateLimitError`)
- Authentication errors (`Anthropic.AuthenticationError`)
- Network/API errors (`Anthropic.APIError`)
- JSON parse errors (`SyntaxError`)
- Zod validation errors
- Any unexpected error (catch-all)

**Skip logic** (`shouldSkipExtraction()`):
- Combined user+assistant text < 40 characters
- User message is only tool invocations with < 20 char assistant response
- User message starts with `[system]`, `[control]`, or slash commands

**Max tokens:** 2048. If `max_tokens` stop reason is hit, attempts to parse partial response before falling back to `EMPTY_EXTRACTION`.

**Client:** Lazy-initialized `Anthropic` instance using `ANTHROPIC_API_KEY` env var.

### prompt.ts -- System Prompt (104 lines)

Builds the complete system prompt for the Haiku extraction call. Includes:
- Task description with 7 extraction categories (concepts, decisions, preferences, topics, code references, intent, urgency)
- Explicit rules: precision over recall, empty arrays over guesses, confirmation counts as decision
- Edge cases: tool-only turns, very short messages, ambiguous preferences, code in messages
- Few-shot examples block (from `examples.ts`)

The prompt is built once at module load time (`EXTRACTION_SYSTEM_PROMPT`) and reused across all calls.

### examples.ts -- Few-Shot Examples (210 lines)

Contains 7 `ExtractionExample` objects, each with a user message, assistant response, and expected `TurnExtraction` output. Coverage:

1. Decision being made (PostgreSQL over MySQL)
2. Preference stated (functional style over OOP)
3. Technical concepts discussed (event sourcing + CQRS)
4. Code references (file paths, function names, class names)
5. Correction/retraction (Redis caching rejected)
6. Mundane turn (minimal extraction -- "thanks, that looks good")
7. Multiple concepts + decision in one turn (Express + Zod + Pino)

### schema.ts -- Zod Schema (66 lines)

Defines the `TurnExtraction` schema and its sub-schemas. Designed for Anthropic structured output constraints:
- No recursive schemas
- No numerical constraints (minimum, maximum)
- No string length constraints (minLength, maxLength)
- `additionalProperties` not used except as `false`
- Array `minItems` only supports 0 and 1

**Sub-schemas:** `ExtractedConcept`, `ExtractedDecision`, `ExtractedPreference`, `ExtractedTopic`, `ExtractedCodeRef`

**Top-level fields:** `concepts`, `decisions`, `preferences`, `topics`, `code_references`, `intent` (enum of 6 values), `urgency` (enum of 3 values)

### buffer.ts -- SQLite Buffer (164 lines)

Local durability buffer using `bun:sqlite` (zero-dependency, built into Bun runtime).

**Database:** `extraction-buffer.db` in the application data directory.

**Pragmas:**
- `journal_mode = WAL` -- Write-Ahead Logging for concurrent reads/writes
- `synchronous = NORMAL` -- Balance between durability and performance

**Table schema:**
```sql
CREATE TABLE extraction_buffer (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  extraction_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  extraction_hash TEXT,
  UNIQUE(session_id, turn_number)
)
```

**Status transitions:** `pending` -> `sending` -> `sent` | `failed`

**Operations:**
- `insert()` -- Generates UUID, computes hash, inserts with `pending` status
- `getPending(limit)` -- Returns oldest pending items (FIFO)
- `markSending(ids)` -- Batch status update before gRPC call
- `markSent(ids)` -- Batch status update on success
- `markFailed(id, error)` -- Increments retry_count, records error message
- `getRetryable(maxRetries)` -- Returns failed items with retry_count < maxRetries
- `cleanup(olderThanDays)` -- Deletes `sent` items older than 7 days

### drain.ts -- Background Drain Loop (145 lines)

3-second interval background loop that drains the SQLite buffer to LEGION via gRPC.

**Lifecycle:**
- `start(intervalMs)` -- Starts the loop, performs immediate drain on startup (crash recovery)
- `stop()` -- Clears interval, performs one final drain before stopping

**Drain cycle (`drainOnce()`):**
1. Fetch up to 10 pending items
2. Mark as `sending`
3. Send each item individually via `getLegionClient().storeExtraction()`
4. On success: mark as `sent`
5. On failure: mark as `failed` (increments retry_count, records error)
6. Fetch retryable failures (retry_count < 5)
7. Repeat send process for retryable items

**Each item is sent individually** -- failure of one does not block others.

**`mapToProto()` function** converts CLI Zod schema field names to gRPC proto field names (see Field Mapping section below).

---

## 4. Read Path (Context Recall)

### bootstrap.ts -- Session Start Graph Seeding (120 lines)

On session start, pulls user context from the LEGION graph to seed the system prompt with persistent memory.

**Data sources:**
1. `getUserProfile()` gRPC call -- returns stored preferences and recent decisions
2. `recallContext()` gRPC call -- returns active topics from graph traversal (limit 10)

**Output format:** Returns a string block with `## Your Memory` header and subsections:
- `### User Preferences` -- Formatted as `- **{category}** -- {key}: {value}`
- `### Active Work` -- Formatted as `- {topic_name} ({status})`
- `### Recent Decisions` -- Formatted as `- **{choice}:** {chosen} ({reasoning})`

Returns `null` if LEGION is unavailable or no data exists.

### recall.ts -- Per-Message Context Recall (158 lines)

Runs on every user message to inject relevant graph context. Uses regex-based entity extraction (no LLM call) to stay within a 300ms performance budget.

**Entity extraction patterns:**
- PascalCase identifiers (2+ chars starting with uppercase): `/\b[A-Z][a-zA-Z0-9]{2,}\b/g`
- camelCase identifiers (lowercase then uppercase): `/\b[a-z]+[A-Z][a-zA-Z0-9]*\b/g`
- File paths (sequences with `/` or common extensions): `.ts`, `.tsx`, `.js`, `.py`, `.rb`, `.go`, `.rs`, `.sql`, `.yml`, `.yaml`, `.json`, `.toml`, `.md`
- Quoted strings (single or double, 2-60 chars)
- 33 known tech terms (case-insensitive match): React, Vue, Angular, Svelte, Next.js, Node.js, Bun, Deno, TypeScript, JavaScript, Python, Ruby, Go, Rust, Docker, Kubernetes, PostgreSQL, Redis, Neo4j, gRPC, GraphQL, REST, Tailwind, Prisma, Drizzle, Zod, tRPC, Anthropic, OpenAI, LEGION, Claude, Haiku, Sonnet, Opus

**Max entities:** 10 (deduplicated via `Set`)

**gRPC call:** `recallContext()` with extracted entity names. Maps response `ContextItem` types to readable format.

**Output format:** Returns `## Relevant Context from Prior Conversations` block with formatted items:
- `- **Decision:** You decided {chosen} because {reasoning}`
- `- **Preference:** You prefer {key}: {value}`
- `- **Topic:** We discussed {name} (status: {status})`
- `- **Code:** {path} was {action}`

Returns `null` if no entities extracted or no context items returned.

### context-monitor.ts -- Token Usage Monitoring (78 lines)

Tracks token usage relative to model context window. Fires warnings when approaching the limit so the session bridge can be built before context is lost.

**Critical lesson (fd893249):** Always include cache tokens in calculation. The Claude API returns `input_tokens` as only the NEW uncached tokens. `cache_read_input_tokens` and `cache_creation_input_tokens` also consume context window space.

**Calculation:**
```
total = inputTokens + cacheReadTokens + cacheCreationTokens + outputTokens
percentage = total / modelContextWindow
shouldReset = percentage >= 0.80
```

**Threshold:** 80% (`CONTEXT_THRESHOLD = 0.80`)

### bridge.ts -- Session Bridge Construction (90 lines)

When the context window approaches its limit, builds a "bridge" summary of the current session state and stores it in the LEGION graph. The next session can use this bridge to resume where work left off.

**Bridge composition:**
- `## Active Threads` -- Topics with status (excluding abandoned)
- `## Open Questions` -- Topics with exploring/open status
- `## Next Steps` -- Derived from remaining action items

**gRPC call:** `buildSessionBridge()` with session ID. Returns `true` on success, `false` on failure or if LEGION is unavailable.

---

## 5. Integration Points

The extraction pipeline hooks into the main codebase at exactly two files:

### `src/project/bootstrap.ts` (lines 52-55)

After LEGION initialization, starts the extraction pipeline:

```typescript
// Initialize extraction pipeline (Infinite Conversation)
const { ExtractionBuffer, ExtractionDrain } = await import("../extraction")
ExtractionBuffer.init()
ExtractionDrain.start()
```

Uses dynamic import to avoid loading extraction code if LEGION is unavailable. Runs inside the `if` block that checks LEGION availability.

### `src/session/prompt.ts` (lines 296-298, 720-747)

**Lines 296-298** -- Hoists variables before the main while loop so post-loop extraction can access them:

```typescript
let _lastUser: MessageV2.User | undefined
let _msgs: MessageV2.WithParts[] = []
```

**Lines 720-747** -- After the while loop exits (turn complete), fires the extraction hook:

```typescript
if (_lastUser && step > 0) {
  const userText = _msgs
    .filter((m) => m.info.role === "user" && m.info.id === _lastUser.id)
    .flatMap((m) => m.parts)
    .filter((p) => p.type === "text" && !p.synthetic)
    .map((p) => (p as MessageV2.TextPart).text)
    .join("\n")

  const assistantText = _msgs
    .filter((m) => m.info.role === "assistant" && m.info.id > _lastUser.id)
    .flatMap((m) => m.parts)
    .filter((p) => p.type === "text")
    .map((p) => (p as MessageV2.TextPart).text)
    .join("\n")

  if (userText && assistantText) {
    import("../extraction").then(({ ExtractionHook }) => {
      ExtractionHook.onTurnComplete({
        sessionId: sessionID,
        turnNumber: step,
        userMessage: userText,
        assistantResponse: assistantText,
      })
    }).catch(() => {})
  }
}
```

The dynamic import with `.catch(() => {})` ensures the extraction pipeline **never breaks conversations**. If the import fails or the hook throws, the conversation proceeds normally.

---

## 6. Backend (gRPC Server)

### Proto File

`conversation_extraction.proto` -- 137 lines, package `legion.conversation_extraction`.

Defines 4 RPCs and their request/response messages:

| RPC | Request | Response |
|---|---|---|
| `StoreExtraction` | `StoreExtractionRequest` | `StoreExtractionResponse` |
| `RecallContext` | `RecallContextRequest` | `RecallContextResponse` |
| `BuildSessionBridge` | `BuildSessionBridgeRequest` | `BuildSessionBridgeResponse` |
| `GetUserProfile` | `GetUserProfileRequest` | `GetUserProfileResponse` |

### ConversationExtractionServicer (990 lines)

Implements all 4 RPCs. Uses a singleton `Neo4jRepository` (lazy-loaded on first request).

#### StoreExtraction

Ingests structured turn data into Neo4j. Single transaction per request (all-or-nothing atomicity).

**Flow:**
1. Validate required fields (session_id, turn_number >= 0, extraction data present)
2. Authenticate via interceptor context
3. Rate warning check (>100 calls/sec)
4. Duplicate turn detection (MATCH by session_id + turn_number)
5. Execute all writes in single transaction:
   - CREATE ConversationTurn node (event -- always new)
   - MERGE Concept nodes + MENTIONS relationships
   - MERGE Topic nodes + ABOUT relationships
   - MERGE Preference nodes + REVEALED relationships (version incremented on match)
   - MERGE CodeEntity nodes + REFERENCES relationships (with action property)
   - CREATE Decision nodes + PRODUCED relationships (event -- always new)
   - Link Decision to chosen Concept via CHOSE relationship (if concept exists)
   - Link ConversationTurn to Engagement via WITHIN relationship (if engagement_id provided)
6. Record metrics (latency, entities count, nodes created)
7. Return created node IDs

**Edge case hardening:**
- Text truncation at 500 characters (concept contexts, decision reasoning)
- Name normalization: `_normalize_name()` strips whitespace and converts to title case for entities
- Key normalization: `_normalize_key()` strips whitespace and lowercases for preference category/key
- Empty arrays: ConversationTurn created even with zero entities
- Neo4j errors: proper gRPC error messages (ServiceUnavailable, SessionExpired, Neo4jError), servicer never crashes

#### RecallContext

Traverses the graph from entity names to related context items.

**Cypher query:** Starts from seed nodes matching entity names (Concept, Topic, Preference, CodeEntity labels), traverses up to `max_hops` (default 3, max 4) relationships in any direction, returns distinct related nodes with their labels and edge types.

**Deduplication:** Uses `(primary_label, name_or_id)` tuple as dedup key.

**Response building:** For each related node, builds a human-readable summary based on node type:
- Decision: "Decided: {summary} -- Chose: {chose} -- Because: {reasoning}"
- Preference: "Preference [{category}:{key}] = {value}"
- Topic: "Topic '{name}' (status: {status})"
- Concept: "Concept '{name}' ({type}) [{sentiment}]"
- CodeEntity: "Code: {name} in {file_path} ({action})"

**Performance target:** <100ms (relies on Neo4j indexes).

#### BuildSessionBridge

Aggregates session data into a SessionBridge node for cross-session continuity.

**Flow:**
1. Query all ConversationTurns for the ending session with their related topics, decisions, and preferences
2. Categorize into active threads, open questions, and next steps
3. CREATE SessionBridge node with aggregated data
4. Link the last ConversationTurn to the bridge via BRIDGED_TO relationship

#### GetUserProfile

Returns aggregated preferences, frequent topics, and recent decisions. Read-only.

**Queries:**
1. Latest preferences: grouped by `category:key`, ordered by version descending, takes latest
2. Frequent topics: ordered by relationship count (ConversationTurn connections), limit 20
3. Recent decisions: last 7 days, ordered by timestamp descending, limit 20

---

## 7. Field Mapping (CLI to Proto)

The `mapToProto()` function in `drain.ts` converts CLI Zod schema field names to gRPC proto field names:

| CLI Field (Zod) | Proto Field | Notes |
|---|---|---|
| `ExtractedConcept.entity` | `name` | Entity name |
| `ExtractedConcept.context` | `sentiment` | How it was mentioned |
| `ExtractedDecision.choice` | `summary` | What was decided |
| `ExtractedDecision.chosen` | `chose` | Selected option |
| `ExtractedDecision.rejected` | `rejected` | CLI: optional string -> Proto: repeated string (wrapped in array) |
| `ExtractedDecision.reasoning` | `reasoning` | Same name |
| `ExtractedPreference.category` | `category` | Same name |
| `ExtractedPreference.key` | `key` | Same name |
| `ExtractedPreference.value` | `value` | Same name |
| `ExtractedPreference.source` | `strength` | "explicit" or "inferred" |
| `ExtractedTopic.name` | `name` | Same name |
| `ExtractedTopic.status` | `status` | Same name |
| `ExtractedCodeRef.path` | `file` | File path |
| `ExtractedCodeRef.type` | `entity` | "file", "function", "class", "module" |
| `ExtractedCodeRef.action` | `action` | Same name |
| `TurnExtraction.code_references` | `code_refs` | Array field name differs |
| `TurnExtraction.intent` | `intent` | Same name |
| `TurnExtraction.urgency` | `urgency` | Same name |

Additional proto fields set by `mapToProto()`:
- `ExtractedDecision.confidence` -- Set to `""` (empty string, not available in CLI schema)

---

## 8. Neo4j Graph Schema

### Constraints

5 uniqueness constraints (simple UNIQUE, not NODE KEY -- DozerDB Community Edition does not support NODE KEY):

| Constraint | Label | Property |
|---|---|---|
| 1 | `Concept` | `name` |
| 2 | `Topic` | `name` |
| 3 | `Preference` | `key` |
| 4 | `CodeEntity` | `name` |
| 5 | `CodeFile` | `path` |

### Indexes

4 indexes for query performance:

| Index | Label | Properties | Purpose |
|---|---|---|---|
| 1 | `ConversationTurn` | `engagement_id` | Filter turns by engagement |
| 2 | `ConversationTurn` | `timestamp` | Order turns chronologically |
| 3 | `Decision` | `timestamp` | Recent decisions query |
| 4 | `Preference` | `category`, `key`, `version` | Composite for latest version lookup |

### Node Types

| Node Label | Type | Key Properties |
|---|---|---|
| `ConversationTurn` | Event (CREATE) | `id`, `session_id`, `turn_number`, `intent`, `urgency`, `timestamp`, `engagement_id` |
| `Concept` | Entity (MERGE) | `name`, `type`, `sentiment`, `created_at`, `last_seen` |
| `Decision` | Event (CREATE) | `id`, `summary`, `chose`, `rejected`, `reasoning`, `confidence`, `timestamp` |
| `Preference` | Entity (MERGE) | `category`, `key`, `value`, `strength`, `version`, `created_at`, `updated_at` |
| `Topic` | Entity (MERGE) | `name`, `status`, `created_at`, `last_seen` |
| `CodeEntity` | Entity (MERGE) | `name`, `file_path`, `type`, `created_at`, `last_seen` |
| `CodeFile` | Entity (MERGE) | `path` |
| `SessionBridge` | Event (CREATE) | `id`, `old_session_id`, `engagement_id`, `active_threads`, `open_questions`, `recent_decisions`, `next_steps`, `timestamp` |

### Relationship Types

| Relationship | From | To | Properties |
|---|---|---|---|
| `MENTIONS` | ConversationTurn | Concept | -- |
| `ABOUT` | ConversationTurn | Topic | -- |
| `REVEALED` | ConversationTurn | Preference | -- |
| `REFERENCES` | ConversationTurn | CodeEntity | `action` |
| `PRODUCED` | ConversationTurn | Decision | -- |
| `CHOSE` | Decision | Concept | -- |
| `WITHIN` | ConversationTurn | Engagement | -- |
| `BRIDGED_TO` | ConversationTurn | SessionBridge | -- |

### Graph Rules

- **Entities MERGE** (Concept, Topic, Preference, CodeEntity) -- Same-named entities are deduplicated via Neo4j MERGE
- **Events CREATE** (ConversationTurn, Decision, SessionBridge) -- Every occurrence creates a new node
- **Latest version wins** for Preferences -- Version counter increments on each MERGE match. Queries order by `version DESC` and take `[0]`
- **Name normalization** prevents duplicates: entity names are title-cased, preference keys/categories are lowercased

---

## 9. Configuration and Prerequisites

### Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (for extraction) | Authenticates Haiku extraction calls |
| `GRPC_SERVER_HOST` | No (default: `localhost`) | LEGION gRPC server hostname |
| `GRPC_SERVER_PORT` | No (default: `50051`) | LEGION gRPC server port |
| `LEGION_API_KEY` | Yes (one auth method) | API key authentication (`lgn_` prefix) |
| `MCP_USER_EMAIL` | Yes (alt auth method) | Email for password authentication |
| `MCP_USER_PASSWORD` | Yes (alt auth method) | Password for password authentication |

### Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@anthropic-ai/sdk` | ^0.74.0 | `zodOutputFormat()` for constrained Haiku output |
| `@opencode-ai/legion-client` | workspace link | gRPC client with 4 conversation extraction methods |
| `bun:sqlite` | built-in | SQLite buffer (WAL mode, zero external deps) |
| `zod` | (existing) | Schema definitions for TurnExtraction |

### Docker Services

| Service | Port | Purpose |
|---|---|---|
| `legion-grpc-server` | 50051 | gRPC server with ConversationExtractionServicer |
| `legion-neo4j` | 7687 (bolt) | DozerDB Community Edition graph database |
| `legion-postgres` | 5432 | PostgreSQL for Alembic migrations and session data |

---

## 10. File Inventory

### CLI -- Extraction Module (`packages/opencode/src/extraction/`)

| File | Lines | Description |
|---|---|---|
| `schema.ts` | 66 | Zod schemas for TurnExtraction and sub-schemas |
| `extract.ts` | 191 | Haiku call with zodOutputFormat, never throws |
| `prompt.ts` | 104 | System prompt with 7 extraction categories and rules |
| `examples.ts` | 210 | 7 few-shot extraction examples |
| `buffer.ts` | 164 | SQLite buffer (bun:sqlite, WAL mode, FIFO drain) |
| `hook.ts` | 82 | queueMicrotask async fire, never blocks |
| `drain.ts` | 145 | 3s background drain loop + mapToProto field conversion |
| `recall.ts` | 158 | Regex entity extraction + graph context recall |
| `context-monitor.ts` | 78 | Token counting with cache tokens (lesson fd893249) |
| `bootstrap.ts` | 120 | Session start graph seeding ("Your Memory" section) |
| `bridge.ts` | 90 | Session bridge construction for context overflow |
| `index.ts` | 33 | Barrel exports for write and read paths |

### CLI -- Integration Points (modified files)

| File | Lines Modified | Description |
|---|---|---|
| `src/project/bootstrap.ts` | 52-55 | Buffer init + drain start (dynamic import) |
| `src/session/prompt.ts` | 296-298, 720-747 | Variable hoisting + extraction hook wiring |

### CLI -- gRPC Client (`packages/legion-client/`)

| File | Description |
|---|---|
| `protos/conversation_extraction.proto` | 137-line proto definition, 4 RPCs |
| `src/types.ts` | 7 new interfaces: TurnExtractionProto, ExtractedConceptProto, ExtractedDecisionProto, ExtractedPreferenceProto, ExtractedTopicProto, ExtractedCodeRefProto, StoreExtractionResponse, RecallContextItem, RecallContextResponse, BuildSessionBridgeResponse, GetUserProfileResponse |
| `src/client.ts` | Lazy stub creation + 4 public methods: storeExtraction(), recallContext(), buildSessionBridge(), getUserProfile() |

### Backend -- gRPC Server (`grpc_server/`)

| File | Description |
|---|---|
| `protos/conversation_extraction.proto` | Source proto (137 lines, copied to client) |
| `protos/conversation_extraction_pb2.py` | Generated protobuf Python bindings |
| `protos/conversation_extraction_pb2_grpc.py` | Generated gRPC service stubs |
| `servicers/conversation_extraction_servicer.py` | All 4 RPCs implemented (990 lines) |
| `servicers/extraction_metrics.py` | In-memory metrics: latency buffers, rate tracking, periodic summary logging (280 lines) |
| `server.py` (lines 136-139) | Servicer registration on gRPC server |

### Backend -- Migrations

| File | Description |
|---|---|
| `scripts/create_conversation_extraction_schema.py` | Neo4j constraints + indexes creation |
| `alembic/versions/045_add_session_type_column.py` | PostgreSQL session type column for extraction sessions |
| `scripts/compact_old_versions.py` | Version compaction maintenance job |

---

## 11. Operational Notes

- **The extraction NEVER blocks conversations.** All extraction runs via `queueMicrotask` and dynamic imports with `.catch(() => {})`. If extraction fails at any point, the conversation proceeds normally.

- **Buffer is crash-safe.** SQLite WAL mode ensures pending items survive crashes. On startup, `ExtractionDrain.start()` immediately drains any pending items from a previous session.

- **Drain loop handles failures gracefully.** Items are sent individually so one failure does not block others. Failed items are retried up to 5 times. Items exceeding max retries remain in the buffer with `failed` status for manual inspection.

- **Neo4j NODE KEY constraints require Enterprise Edition.** The system uses simple UNIQUE constraints instead, compatible with DozerDB Community Edition.

- **Cache tokens must be included in context monitoring.** Per lesson fd893249, the Claude API `input_tokens` field reports only uncached tokens. Context monitoring must sum `input_tokens + cache_read_input_tokens + cache_creation_input_tokens + output_tokens` for accurate usage calculation.

- **Haiku model:** `claude-haiku-4-5-20251001`, max_tokens 2048. Uses `zodOutputFormat()` for constrained decoding (guaranteed schema compliance).

- **Metrics tracking** is in-memory only (no external dependencies). Tracks store/recall call counts, latency (ring buffer with p50/p95/max), entities per turn average, node growth rate per hour, and current calls-per-second rate. Logs summary every 100 StoreExtraction calls.

- **Duplicate detection** prevents re-processing if the same turn is sent twice (e.g., drain retry after network recovery). Checked via `MATCH (t:ConversationTurn {session_id, turn_number})` before creating.

- **Cleanup:** Sent items older than 7 days are eligible for cleanup via `ExtractionBuffer.cleanup()`. This is a manual operation -- no automatic scheduled cleanup is currently wired.
