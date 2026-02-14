/**
 * IPC Protocol Types for Headless LEGION Delegations
 *
 * Pure TypeScript interfaces — no runtime code.
 * Defines the JSONL message envelope and all event/command types
 * exchanged between parent (orchestrator) and child (delegated agent)
 * over Unix Domain Sockets.
 */

// ---------------------------------------------------------------------------
// Base Envelope
// ---------------------------------------------------------------------------

/** Base envelope for all IPC messages */
export interface IpcMessage {
  /** Discriminator — determines event/command type */
  type: string
  /** Delegation this message belongs to */
  delegationId: string
  /** Unix timestamp in milliseconds */
  ts: number
}

// ---------------------------------------------------------------------------
// Child -> Parent Events
// ---------------------------------------------------------------------------

export interface ConnectedEvent extends IpcMessage {
  type: "connected"
  agentId: string
  agentName: string
  agentRole: string
  model: string
  task: string
  pid: number
}

export interface StatusEvent extends IpcMessage {
  type: "status"
  status: "initializing" | "running" | "completing" | "completed" | "failed" | "cancelled"
  message?: string
}

export interface ActionEvent extends IpcMessage {
  type: "action"
  /** Human-readable action description */
  action: string
  /** Tool name if currently in a tool call */
  tool?: string
}

export interface ToolStartEvent extends IpcMessage {
  type: "tool_start"
  tool: string
  /** Tool input — truncated to 2KB max */
  input: Record<string, unknown>
}

export interface ToolEndEvent extends IpcMessage {
  type: "tool_end"
  tool: string
  /** Duration in milliseconds */
  durationMs: number
  success: boolean
  /** First 500 chars of output */
  outputPreview?: string
}

export interface TokensEvent extends IpcMessage {
  type: "tokens"
  turn: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  /** Cost for this turn in USD */
  turnCostUsd: number
  /** Cumulative cost across all turns */
  totalCostUsd: number
}

export interface TurnEvent extends IpcMessage {
  type: "turn"
  turn: number
  role: "user" | "assistant"
  /** First 500 chars of content */
  contentPreview: string
  /** Number of tool calls in this turn */
  toolCallCount: number
}

export interface ErrorEvent extends IpcMessage {
  type: "error"
  error: string
  /** Can the delegation continue despite this error? */
  recoverable: boolean
  /** Error category for grouping */
  category?: "network" | "auth" | "tool" | "llm" | "extraction" | "internal"
}

export interface ResultEvent extends IpcMessage {
  type: "result"
  summary: string
  toolsUsed: string[]
  turns: number
  costUsd: number
  /** Duration of entire delegation in ms */
  durationMs: number
}

export interface PongResponse extends IpcMessage {
  type: "pong"
}

// ---------------------------------------------------------------------------
// Parent -> Child Commands
// ---------------------------------------------------------------------------

export interface CancelCommand extends IpcMessage {
  type: "cancel"
  reason?: string
}

export interface PingCommand extends IpcMessage {
  type: "ping"
}

// ---------------------------------------------------------------------------
// Type Unions
// ---------------------------------------------------------------------------

/** All possible child -> parent events */
export type ChildEvent =
  | ConnectedEvent
  | StatusEvent
  | ActionEvent
  | ToolStartEvent
  | ToolEndEvent
  | TokensEvent
  | TurnEvent
  | ErrorEvent
  | ResultEvent
  | PongResponse

/** All possible parent -> child commands */
export type ParentCommand = CancelCommand | PingCommand
