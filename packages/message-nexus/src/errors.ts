/**
 * Standard JSON-RPC 2.0 and Nexus-specific error codes.
 */
export enum NexusErrorCode {
  // JSON-RPC 2.0 standard codes
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,

  // Nexus-specific codes
  Timeout = -32001,
  SendFailed = -32002,
  InvalidResponse = -32003,
}

/**
 * Custom error class for MessageNexus.
 */
export class NexusError<D = any> extends Error {
  public readonly code: number
  public readonly data?: D

  constructor(message: string, code: number = NexusErrorCode.InternalError, data?: D, name?: string, stack?: string) {
    super(message)
    this.name = name || 'NexusError'
    this.code = code
    this.data = data
    if (stack) {
      this.stack = stack
    }
    // Ensure the prototype is correctly set for inheritance in all environments
    Object.setPrototypeOf(this, NexusError.prototype)
  }
}
