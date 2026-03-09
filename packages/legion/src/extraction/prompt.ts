/**
 * System prompt for the Haiku extraction call.
 *
 * Builds the full system prompt including task description, few-shot
 * examples, and edge case handling instructions. Used with
 * zodOutputFormat() for constrained structured output.
 */

import { extractionExamples, type ExtractionExample } from "./examples"
import type { TurnExtraction } from "./schema"

function formatExample(example: ExtractionExample, index: number): string {
  return `### Example ${index + 1}

**User:** ${example.user}

**Assistant:** ${example.assistant}

**Extraction:**
\`\`\`json
${JSON.stringify(example.extraction, null, 2)}
\`\`\``
}

function buildExamplesBlock(): string {
  return extractionExamples.map((ex, i) => formatExample(ex, i)).join("\n\n")
}

/**
 * Build the complete system prompt for the Haiku extraction call.
 *
 * The output format is enforced by Anthropic structured outputs
 * (zodOutputFormat), so the prompt focuses on extraction quality
 * rather than format compliance.
 */
export function buildExtractionPrompt(): string {
  return `You are a precise conversation analyst. Your task is to extract structured information from a single conversation turn (one user message and one assistant response).

## Task

Analyze the conversation turn and extract:

1. **Concepts** — Technical terms, technologies, patterns, requirements, constraints, or domain concepts mentioned. Only extract concepts with substance — skip generic words like "code" or "project".

2. **Decisions** — Choices that were made or confirmed. A decision requires a clear selection between options. Mere discussion of options is NOT a decision. Look for language like "let's use", "I'll go with", "we decided", or explicit confirmation.

3. **Preferences** — User preferences about how they want things done. Can be explicit ("I prefer X") or inferred from consistent behavior. Mark as "explicit" when directly stated, "inferred" when deduced from context.

4. **Topics** — What subjects are being discussed and their status:
   - "exploring" — just talking about it, no commitment
   - "active" — actively working on it
   - "decided" — conclusion reached
   - "abandoned" — explicitly dropped

5. **Code References** — Files, functions, classes, or modules mentioned. Extract the path or name and what action relates to it:
   - "discussed" — just talking about it
   - "planned" — will be changed/created
   - "modified" — being changed now
   - "created" — being created now

6. **Intent** — The primary purpose of this turn:
   - "question" — user is asking something
   - "decision" — a choice is being made
   - "exploration" — discussing options, brainstorming
   - "correction" — retracting or changing a previous statement
   - "instruction" — user giving direction
   - "feedback" — acknowledgment, approval, or critique

7. **Urgency** — How time-sensitive this feels:
   - "low" — casual, informational, no rush
   - "normal" — standard work conversation
   - "high" — urgent bug, blocking issue, time-sensitive

8. **LEGION Context** — If the conversation references LEGION engagements, tasks, or delegations with their UUIDs (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), extract the most relevant/current ID for each type. These appear naturally when the assistant mentions creating or working within engagements, tasks, or delegations. Only extract IDs that are clearly UUIDs — do not guess or extract partial strings.

## Rules

- Extract ONLY what is explicitly present or strongly implied in the turn.
- Do NOT hallucinate concepts, decisions, or preferences that aren't there.
- Prefer empty arrays over guessed extractions.
- A mundane turn ("thanks", "ok", "got it") should have mostly empty arrays with intent "feedback" and urgency "low".
- If the assistant uses a tool but there's no substantive text exchange, extract minimally.
- Short confirmations like "yes, do that" following a proposal count as decisions — the decision was confirmed even if it was proposed earlier.
- Corrections override previous context: if the user says "actually, forget X", extract a decision rejecting X.

## Edge Cases

- **Tool-only turns:** If the user message is just a tool invocation with no text, extract minimally. Set intent based on the tool action.
- **Very short messages:** "ok", "thanks", "yes" — extract as feedback with empty arrays. Only flag a decision if it confirms a pending proposal in context.
- **Ambiguous preferences:** If uncertain whether something is a preference, skip it. Only extract preferences with clear signal.
- **Code in messages:** If the user pastes code, extract file/function references from it but don't extract the code itself as a concept.

## Examples

${buildExamplesBlock()}

## Your Turn

Analyze the provided conversation turn and produce the extraction. Remember: precision over recall. Empty arrays are better than guesses.`
}

/**
 * Pre-built prompt string for reuse across calls.
 * Avoids rebuilding on every extraction.
 */
export const EXTRACTION_SYSTEM_PROMPT = buildExtractionPrompt()

/**
 * Build system prompt with accumulated state from previous turns.
 * When previousState is non-empty, appends an "Already Extracted" section
 * so Haiku only extracts NEW items or STATUS CHANGES.
 */
export function buildExtractionPromptWithState(previousState?: TurnExtraction[]): string {
  const base = EXTRACTION_SYSTEM_PROMPT
  if (!previousState || previousState.length === 0) return base

  const sections: string[] = [
    "",
    "## Already Extracted (Previous Turns)",
    "",
    "The following has already been extracted from earlier turns in this session. Do NOT re-extract these items. Only extract NEW information or STATUS CHANGES.",
    "",
  ]

  const allConcepts = new Set<string>()
  const allTopics = new Set<string>()
  const allDecisions = new Set<string>()
  const allCodeRefs = new Set<string>()

  for (const prev of previousState) {
    for (const c of prev.concepts) allConcepts.add(`${c.entity} (${c.type})`)
    for (const t of prev.topics) allTopics.add(`${t.name} [${t.status}]`)
    for (const d of prev.decisions) allDecisions.add(d.choice)
    for (const cr of prev.code_references) allCodeRefs.add(`${cr.path}:${cr.name} (${cr.action})`)
  }

  if (allConcepts.size > 0) {
    sections.push("**Already extracted concepts:** " + Array.from(allConcepts).join(", "))
  }
  if (allTopics.size > 0) {
    sections.push("**Already extracted topics:** " + Array.from(allTopics).join(", "))
  }
  if (allDecisions.size > 0) {
    sections.push("**Already extracted decisions:** " + Array.from(allDecisions).join(", "))
  }
  if (allCodeRefs.size > 0) {
    sections.push("**Already extracted code refs:** " + Array.from(allCodeRefs).join(", "))
  }

  sections.push("")
  sections.push("If a topic's status CHANGED (e.g., exploring → decided), re-extract it with the new status. Otherwise, skip it.")

  return base + sections.join("\n")
}
