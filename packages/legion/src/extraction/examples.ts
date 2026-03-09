/**
 * Few-shot examples for Haiku TurnExtraction.
 *
 * Each example shows a (user, assistant) exchange and the expected
 * TurnExtraction output. These are interpolated into the system prompt
 * so Haiku learns extraction quality from concrete samples.
 *
 * Coverage:
 * 1. Decision being made
 * 2. Preference stated
 * 3. Technical concepts discussed
 * 4. Code references
 * 5. Correction / retraction
 * 6. Mundane turn (minimal extraction)
 * 7. Multiple concepts + decision in one turn
 */

import type { TurnExtraction } from "./schema"

export interface ExtractionExample {
  user: string
  assistant: string
  extraction: TurnExtraction
}

export const extractionExamples: ExtractionExample[] = [
  // 1. Decision being made
  {
    user: "I've been going back and forth, but let's use PostgreSQL instead of MySQL for the new service. The JSON column support is way better and we already have pg expertise on the team.",
    assistant:
      "Good call. PostgreSQL's jsonb type will save us from needing a separate document store for the semi-structured data. I'll update the docker-compose and schema files.",
    extraction: {
      concepts: [
        { entity: "PostgreSQL", type: "technology", context: "Selected as database for new service" },
        { entity: "MySQL", type: "technology", context: "Rejected alternative database" },
        { entity: "jsonb", type: "technology", context: "PostgreSQL JSON column support was deciding factor" },
      ],
      decisions: [
        {
          choice: "Database for new service",
          chosen: "PostgreSQL",
          rejected: "MySQL",
          reasoning: "Better JSON column support (jsonb) and existing team expertise",
        },
      ],
      preferences: [],
      topics: [{ name: "database selection", status: "decided" }],
      code_references: [],
      intent: "decision",
      urgency: "normal",
    },
  },

  // 2. Preference stated
  {
    user: "By the way, I prefer functional style over OOP for this project. Keep things as pure functions with explicit arguments, no class hierarchies.",
    assistant:
      "Understood. I'll use plain functions, avoid classes, and keep state explicit via arguments and return values. If I need to group related functions, I'll use module namespaces instead of classes.",
    extraction: {
      concepts: [{ entity: "functional programming", type: "pattern", context: "Preferred paradigm for the project" }],
      decisions: [],
      preferences: [
        {
          category: "code_style",
          key: "paradigm",
          value: "functional over OOP, pure functions with explicit arguments",
          source: "explicit",
        },
        {
          category: "code_style",
          key: "state_management",
          value: "explicit via arguments and return values, no class hierarchies",
          source: "explicit",
        },
      ],
      topics: [{ name: "coding style", status: "decided" }],
      code_references: [],
      intent: "instruction",
      urgency: "normal",
    },
  },

  // 3. Technical concepts discussed (architecture)
  {
    user: "I'm thinking about using event sourcing for the order system. We'd store every state change as an event and rebuild current state by replaying. What do you think about combining it with CQRS?",
    assistant:
      "Event sourcing + CQRS is a natural fit. You'd have a write model that appends events and a read model (projections) optimized for queries. The main trade-off is eventual consistency between write and read sides. For an order system, that's usually fine since you can show 'processing' states.",
    extraction: {
      concepts: [
        { entity: "event sourcing", type: "pattern", context: "Considered for order system state management" },
        { entity: "CQRS", type: "pattern", context: "Proposed to combine with event sourcing" },
        { entity: "eventual consistency", type: "constraint", context: "Trade-off of CQRS approach" },
        { entity: "projections", type: "pattern", context: "Read model in CQRS architecture" },
      ],
      decisions: [],
      preferences: [],
      topics: [
        { name: "order system architecture", status: "exploring" },
        { name: "event sourcing", status: "exploring" },
      ],
      code_references: [],
      intent: "exploration",
      urgency: "normal",
    },
  },

  // 4. Code references
  {
    user: "Look at src/auth/handler.ts, the validateToken function is broken. It doesn't check token expiry. Also we need to update the AuthService class in src/auth/service.ts.",
    assistant:
      "I see the issue in validateToken. It parses the JWT but never checks the exp claim. I'll add expiry validation there and update AuthService.authenticate() to propagate the new error type.",
    extraction: {
      concepts: [{ entity: "JWT", type: "technology", context: "Token validation issue with expiry check" }],
      decisions: [],
      preferences: [],
      topics: [{ name: "authentication bug fix", status: "active" }],
      code_references: [
        { path: "src/auth/handler.ts", name: "handler.ts", type: "file", action: "discussed" },
        { path: "src/auth/handler.ts", name: "validateToken", type: "function", action: "discussed" },
        { path: "src/auth/service.ts", name: "service.ts", type: "file", action: "planned" },
        { path: "src/auth/service.ts", name: "AuthService", type: "class", action: "planned" },
      ],
      intent: "instruction",
      urgency: "high",
    },
  },

  // 5. Correction / retraction
  {
    user: "Actually, forget the Redis caching approach I mentioned earlier. After looking at the traffic patterns, most requests are unique so a cache would just waste memory. Let's go with direct DB queries and optimize the indexes instead.",
    assistant:
      "Makes sense. With mostly unique requests, cache hit rates would be too low to justify the infrastructure. I'll focus on adding composite indexes for the frequent query patterns instead.",
    extraction: {
      concepts: [
        { entity: "Redis", type: "technology", context: "Caching approach rejected after traffic analysis" },
        { entity: "composite indexes", type: "pattern", context: "Alternative to caching for query optimization" },
      ],
      decisions: [
        {
          choice: "Query optimization strategy",
          chosen: "Direct DB queries with optimized indexes",
          rejected: "Redis caching",
          reasoning: "Traffic patterns show mostly unique requests, cache hit rate would be too low",
        },
      ],
      preferences: [],
      topics: [{ name: "performance optimization", status: "active" }],
      code_references: [],
      intent: "correction",
      urgency: "normal",
    },
  },

  // 6. Mundane turn (minimal extraction)
  {
    user: "Thanks, that looks good.",
    assistant: "You're welcome! Let me know if you need anything else.",
    extraction: {
      concepts: [],
      decisions: [],
      preferences: [],
      topics: [],
      code_references: [],
      intent: "feedback",
      urgency: "low",
    },
  },

  // 7. Multiple concepts + decision in one turn
  {
    user: "For the API gateway, let's use Express with TypeScript. I want request validation using Zod schemas, rate limiting with a sliding window algorithm, and structured logging with Pino. Skip Fastify — the middleware ecosystem is better with Express for our plugins.",
    assistant:
      "Solid choices. I'll set up Express + TypeScript with Zod for request/response validation, implement sliding window rate limiting (probably using a Redis sorted set for distributed tracking), and wire Pino as the logger with request correlation IDs.",
    extraction: {
      concepts: [
        { entity: "Express", type: "technology", context: "Selected framework for API gateway" },
        { entity: "TypeScript", type: "technology", context: "Language for API gateway implementation" },
        { entity: "Zod", type: "technology", context: "Request/response validation library" },
        { entity: "sliding window rate limiting", type: "pattern", context: "Rate limiting algorithm choice" },
        { entity: "Pino", type: "technology", context: "Structured logging library" },
        { entity: "Fastify", type: "technology", context: "Rejected alternative to Express" },
      ],
      decisions: [
        {
          choice: "API gateway framework",
          chosen: "Express with TypeScript",
          rejected: "Fastify",
          reasoning: "Better middleware ecosystem for plugin support",
        },
      ],
      preferences: [
        {
          category: "tooling",
          key: "validation_library",
          value: "Zod schemas for request validation",
          source: "explicit",
        },
        {
          category: "tooling",
          key: "logging_library",
          value: "Pino for structured logging",
          source: "explicit",
        },
      ],
      topics: [{ name: "API gateway setup", status: "active" }],
      code_references: [],
      intent: "decision",
      urgency: "normal",
    },
  },
]
