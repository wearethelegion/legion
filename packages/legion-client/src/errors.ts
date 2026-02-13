/**
 * Custom error classes for LEGION gRPC client.
 *
 * Provides typed errors for auth failures, connection issues, and general gRPC errors.
 */

export class LegionError extends Error {
  code: string
  retryable: boolean
  details?: string

  constructor(message: string, code: string, retryable = false, details?: string) {
    super(message)
    this.name = "LegionError"
    this.code = code
    this.retryable = retryable
    this.details = details
  }
}

export class LegionAuthError extends LegionError {
  constructor(message: string, details?: string) {
    super(message, "AUTH_ERROR", false, details)
    this.name = "LegionAuthError"
  }
}

export class LegionConnectionError extends LegionError {
  constructor(message: string, details?: string) {
    super(message, "CONNECTION_ERROR", true, details)
    this.name = "LegionConnectionError"
  }
}
