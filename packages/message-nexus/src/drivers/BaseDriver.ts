export type JsonRpcId = string | number | null

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  method: string
  params?: unknown
  id: JsonRpcId
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
  id: JsonRpcId
}

export interface NexusEnvelope<T = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification> {
  from: string
  to?: string
  metadata?: Record<string, unknown>
  payload: T
}

export type Message = NexusEnvelope

export default class BaseDriver {
  onMessage: ((data: Message) => void) | null
  onConnect: (() => void) | null
  onDisconnect: (() => void) | null

  constructor() {
    this.onMessage = null
    this.onConnect = null
    this.onDisconnect = null
  }
  send(data: Message) {
    throw new Error('Not implemented')
  }
  destroy() {
    // Override in subclasses to clean up resources
  }
}
