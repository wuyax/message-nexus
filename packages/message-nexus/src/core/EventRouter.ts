import type { Message, JsonRpcRequest, JsonRpcNotification } from '../drivers/BaseDriver'
import { NexusError, NexusErrorCode } from '../errors'

export interface InvokeContext {
  messageId?: string
  from: string
  to?: string
  metadata?: Record<string, unknown>
}

export type InvokeHandler<P = unknown, R = unknown> = (
  params: P,
  context: InvokeContext,
) => R | Promise<R>

export type NotificationHandler<P = unknown> = (params: P, context: InvokeContext) => void

export class EventRouter<
  InvokeMap extends object = Record<string, any>,
  NotificationMap extends object = Record<string, any>,
> {
  private invokeHandlers: Map<string, InvokeHandler> = new Map()
  private notificationHandlers: Map<string, Set<NotificationHandler>> = new Map()

  handle<K extends keyof InvokeMap>(
    method: string,
    handler: InvokeHandler<any, any>,
  ): () => boolean {
    this.invokeHandlers.set(method, handler)
    return () => this.invokeHandlers.delete(method)
  }

  removeHandler(method: string): boolean {
    return this.invokeHandlers.delete(method)
  }

  onNotification<K extends keyof NotificationMap>(
    method: string,
    handler: NotificationHandler<any>,
  ): () => void {
    if (!this.notificationHandlers.has(method)) {
      this.notificationHandlers.set(method, new Set())
    }
    this.notificationHandlers.get(method)!.add(handler)
    return () => this.offNotification(method, handler)
  }

  offNotification<K extends keyof NotificationMap>(
    method: string,
    handler: NotificationHandler<any>,
  ): void {
    const handlers = this.notificationHandlers.get(method)
    if (handlers) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        this.notificationHandlers.delete(method)
      }
    }
  }

  hasInvokeHandler(method: string): boolean {
    return this.invokeHandlers.has(method)
  }

  getInvokeHandler(method: string): InvokeHandler | undefined {
    return this.invokeHandlers.get(method)
  }

  getNotificationHandlers(method: string): Set<NotificationHandler> | undefined {
    return this.notificationHandlers.get(method)
  }

  get invokeHandlersCount(): number {
    return this.invokeHandlers.size
  }

  get notificationHandlersCount(): number {
    return this.notificationHandlers.size
  }

  clear(): void {
    this.invokeHandlers.clear()
    this.notificationHandlers.clear()
  }

  static validateMessage(data: unknown): data is Message {
    if (!data || typeof data !== 'object') return false
    const env = data as Partial<Message>

    // 1. Basic Envelope Validation
    if (typeof env.from !== 'string' || env.from.trim() === '') return false
    if (env.to !== undefined && (typeof env.to !== 'string' || env.to.trim() === '')) return false
    if (env.metadata !== undefined && (typeof env.metadata !== 'object' || env.metadata === null)) return false

    // 2. Payload Validation
    const payload = env.payload as any
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
    if (payload.jsonrpc !== '2.0') return false

    // 3. ID Validation (if present, must be string, number, or null)
    if ('id' in payload) {
      const id = payload.id
      if (id !== null && typeof id !== 'string' && typeof id !== 'number') return false
    }

    // 4. Branching Logic (Request vs Notification vs Response)
    const hasMethod = typeof payload.method === 'string' && payload.method.trim() !== ''
    const hasResult = 'result' in payload
    const hasError = payload.error !== undefined && typeof payload.error === 'object' && payload.error !== null

    // Request or Notification
    if (hasMethod) {
      // If it has a method, it cannot also be a response
      if (hasResult || hasError) return false
      return true
    }

    // Response
    if (hasResult || hasError) {
      // Response MUST have an ID
      if (!('id' in payload)) return false
      // Cannot have both result and error
      if (hasResult && hasError) return false
      
      if (hasError) {
        if (typeof payload.error.code !== 'number') return false
        if (typeof payload.error.message !== 'string') return false
      }
      return true
    }

    return false
  }
}
