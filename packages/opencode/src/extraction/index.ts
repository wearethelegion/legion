/**
 * Extraction Pipeline — Barrel Exports
 *
 * Re-exports all public APIs from the extraction subsystem.
 * Covers both the write path (extract → buffer → drain) and
 * the read path (recall → bootstrap → bridge → context monitor).
 */

// Schema types
export {
  TurnExtraction,
  ExtractedConcept,
  ExtractedDecision,
  ExtractedPreference,
  ExtractedTopic,
  ExtractedCodeRef,
} from "./schema"

// Write path — extraction
export { extractTurn, extractForCompaction, shouldSkipExtraction, EMPTY_EXTRACTION } from "./extract"
export { EXTRACTION_SYSTEM_PROMPT } from "./prompt"

// Write path — buffering & drain (created by parallel delegation)
export { ExtractionBuffer } from "./buffer"
export { ExtractionHook } from "./hook"
export { ExtractionDrain } from "./drain"

// Read path — recall & context
export { ExtractionRecall } from "./recall"
export { ContextMonitor } from "./context-monitor"
export { SessionBootstrap } from "./bootstrap"
export { SessionBridge } from "./bridge"
export { GraphCompaction } from "./graph-compaction"
