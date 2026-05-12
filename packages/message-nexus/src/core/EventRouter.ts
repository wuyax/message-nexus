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

  clear(): void {
    this.invokeHandlers.clear()
    this.notificationHandlers.clear()
  }

  static validateMessage(data: unknown): data is Message {
    if (!data || typeof data !== 'object') return false
    const env = data as Partial<Message>

    if (typeof env.from !== 'string') return false
    if (env.to !== undefined && typeof env.to !== 'string') return false
    if (env.metadata !== undefined && typeof env.metadata !== 'object') return false

    const payload = env.payload as any
    if (!payload || typeof payload !== 'object') return false
    if (payload.jsonrpc !== '2.0') return false

    const isRequest = 'method' in payload
    const isResponse = 'result' in payload || 'error' in payload

    if (!isRequest && !isResponse) return false

    return true
  }
}
