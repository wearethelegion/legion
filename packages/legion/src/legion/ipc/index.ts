/**
 * IPC Layer — Barrel exports
 *
 * Unix Domain Socket + JSONL communication between parent (orchestrator)
 * and child (delegated agent) processes for real-time delegation streaming.
 */

// Protocol types
export type {
  IpcMessage,
  ConnectedEvent,
  StatusEvent,
  ActionEvent,
  ToolStartEvent,
  ToolEndEvent,
  TokensEvent,
  TurnEvent,
  ErrorEvent,
  ResultEvent,
  PongResponse,
  CancelCommand,
  PingCommand,
  ChildEvent,
  ParentCommand,
} from "./protocol"

// JSONL parser
export { JsonlParser } from "./buffer"

// Client (child side)
export { IpcClient } from "./client"

// Server (parent side)
export { IpcServer } from "./server"
