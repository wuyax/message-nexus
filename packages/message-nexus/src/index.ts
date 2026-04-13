import BaseDriver, {
  type Message,
  type NexusEnvelope,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcNotification,
} from './drivers/BaseDriver'
import BroadcastDriver from './drivers/BroadcastDriver'
import MittDriver from './drivers/MittDriver'
import PostMessageDriver from './drivers/PostMessageDriver'
import WebSocketDriver from './drivers/WebSocktDriver'
import {
  Logger,
  LoggerInterface,
  SimpleLogger,
  LogLevel,
  createConsoleHandler,
  isLogger,
  isSimpleLogger,
} from './utils/logger'
import { createEmitter } from './utils/emitter'

export interface MessageNexusOptions {
  instanceId?: string
  timeout?: number
  logger?: LoggerInterface | SimpleLogger
  loggerEnabled?: boolean
  logLevel?: LogLevel
}

export interface InvokeOptions {
  method: string
  params?: unknown
  to?: string
  metadata?: Record<string, unknown>
  timeout?: number
  retryCount?: number
  retryDelay?: number
}

export interface NotificationOptions {
  method: string
  params?: unknown
  to?: string
  metadata?: Record<string, unknown>
}

export interface InvokeContext {
  messageId?: string
  from: string
  to?: string
  metadata?: Record<string, unknown>
}

export type InvokeHandler<Params = any, Result = any> = (
  params: Params,
  context: InvokeContext,
) => Result | Promise<Result>

export type NotificationHandler<Params = any> = (params: Params, context: InvokeContext) => void

export type ErrorHandler = (error: Error, context?: Record<string, unknown>) => void

export interface Metrics {
  messagesSent: number
  messagesReceived: number
  messagesFailed: number
  pendingMessages: number
  queuedMessages: number
  totalLatency: number
  averageLatency: number
}

export type MetricsCallback = (metrics: Metrics) => void

export default class MessageNexus<GlobalRequestPayload = unknown, GlobalResponsePayload = unknown> {
  driver: BaseDriver
  pendingTasks: Map<
    string,
    {
      resolve: (value: any) => void
      reject: (reason?: unknown) => void
      timer: ReturnType<typeof setTimeout>
      to?: string
      timestamp: number
    }
  >
  invokeHandlers: Map<string, InvokeHandler>
  notificationHandlers: Map<string, Set<NotificationHandler>>
  timeout: number
  instanceId: string
  private cleanupInterval: ReturnType<typeof setInterval> | null = null
  private messageQueue: Message[] = []
  private maxQueueSize: number = 100
  private errorHandler: ErrorHandler | null = null
  private logger: LoggerInterface
  private metrics: Metrics = {
    messagesSent: 0,
    messagesReceived: 0,
    messagesFailed: 0,
    pendingMessages: 0,
    queuedMessages: 0,
    totalLatency: 0,
    averageLatency: 0,
  }
  private metricsCallbacks: Set<MetricsCallback> = new Set()

  constructor(driver: BaseDriver, options?: MessageNexusOptions) {
    this.driver = driver
    this.instanceId = options?.instanceId || crypto.randomUUID()
    this.timeout = options?.timeout ?? 10000

    const logLevel = options?.logLevel ?? LogLevel.INFO
    const loggerEnabled = options?.loggerEnabled ?? false

    if (options?.logger && isLogger(options.logger)) {
      this.logger = options.logger
    } else {
      this.logger = new Logger('MessageNexus', logLevel, loggerEnabled)
      if (options?.logger && isSimpleLogger(options.logger)) {
        const simpleLogger = options.logger
        this.logger.addHandler((entry) => {
          const { level, message, metadata } = entry
          if (level === LogLevel.DEBUG) simpleLogger.debug(message, metadata)
          else if (level === LogLevel.INFO) simpleLogger.info(message, metadata)
          else if (level === LogLevel.WARN) simpleLogger.warn(message, metadata)
          else if (level === LogLevel.ERROR) simpleLogger.error(message, metadata)
        })
      } else if (loggerEnabled) {
        this.logger.addHandler(createConsoleHandler())
      }
    }

    if (loggerEnabled) {
      this.logger.enable()
      this.logger.info('MessageNexus initialized', {
        instanceId: this.instanceId,
        timeout: this.timeout,
        logLevel,
      })
    }
    this.pendingTasks = new Map()
    this.invokeHandlers = new Map()
    this.notificationHandlers = new Map()
    this.cleanupInterval = null

    this.driver.onMessage = (data) => this._handleIncoming(data)
  }

  async invoke<T = GlobalResponsePayload>(methodOrOptions: string | InvokeOptions): Promise<T> {
    const id = crypto.randomUUID()

    let method: string
    let params: unknown
    let to: string | undefined
    let metadata: Record<string, unknown>
    let timeout: number
    let retryCount = 0
    let retryDelay = 1000

    if (typeof methodOrOptions === 'string') {
      method = methodOrOptions
      params = undefined
      to = undefined
      metadata = {}
      timeout = this.timeout
    } else {
      const opts = methodOrOptions
      method = opts.method
      params = opts.params
      to = opts.to
      metadata = opts.metadata || {}
      timeout = opts.timeout ?? this.timeout
      retryCount = opts.retryCount ?? 0
      retryDelay = opts.retryDelay ?? 1000
    }

    const attempt = async (attemptNumber: number): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingTasks.delete(id)
          this.metrics.messagesFailed++
          this.metrics.pendingMessages--
          reject(new Error(`Message timeout: ${method} (${id})`))
        }, timeout)

        this.pendingTasks.set(id, { resolve, reject, timer, timestamp: Date.now() })

        const rpcRequest: JsonRpcRequest = {
          jsonrpc: '2.0',
          method,
          params,
          id,
        }

        const message: Message = {
          from: this.instanceId,
          to,
          metadata: { ...metadata, timestamp: Date.now() },
          payload: rpcRequest,
        }

        this._sendMessage(message)
      }).catch((error) => {
        if (attemptNumber < retryCount) {
          return new Promise<T>((resolve) =>
            setTimeout(() => resolve(attempt(attemptNumber + 1)), retryDelay * (attemptNumber + 1)),
          )
        }
        this.metrics.messagesFailed++
        this.metrics.pendingMessages--
        throw error
      })
    }

    return attempt(0)
  }

  private _sendMessage(message: Message) {
    const payload = message.payload as JsonRpcRequest | JsonRpcResponse | JsonRpcNotification
    const isRequest = 'method' in payload
    const messageId = 'id' in payload ? String(payload.id) : undefined
    const typeOrMethod = isRequest ? payload.method : 'RESPONSE'

    try {
      this.driver.send(message)
      this.metrics.messagesSent++
      if (isRequest && messageId !== undefined) {
        this.metrics.pendingMessages++
      }
      this.logger.debug('Message sent', { messageId, type: typeOrMethod })
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.metrics.messagesFailed++
      this.logger.error('Failed to send message', { error: err.message, messageId })
      this.errorHandler?.(err, { message })

      if (this.messageQueue.length < this.maxQueueSize) {
        this.messageQueue.push(message)
        this.logger.debug('Message queued', {
          messageId,
          queueSize: this.messageQueue.length + 1,
        })
      } else {
        this.logger.warn('Message queue full, dropping oldest message', {
          queueSize: this.messageQueue.length,
        })
        this.messageQueue.shift()
        this.messageQueue.push(message)
      }
    }
    this.metrics.queuedMessages = this.messageQueue.length
    this._notifyMetrics()
  }

  onError(handler: ErrorHandler) {
    this.errorHandler = handler
    return () => {
      this.errorHandler = null
    }
  }

  flushQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()
      if (message) {
        try {
          this.driver.send(message)
        } catch (error) {
          this.messageQueue.unshift(message)
          break
        }
      }
    }
  }

  notify(methodOrOptions: string | NotificationOptions) {
    let method: string
    let params: unknown
    let to: string | undefined
    let metadata: Record<string, unknown>

    if (typeof methodOrOptions === 'string') {
      method = methodOrOptions
      params = undefined
      to = undefined
      metadata = {}
    } else {
      const opts = methodOrOptions
      method = opts.method
      params = opts.params
      to = opts.to
      metadata = opts.metadata || {}
    }

    const rpcNotification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    }

    const message: Message = {
      from: this.instanceId,
      to,
      metadata: { ...metadata, timestamp: Date.now() },
      payload: rpcNotification,
    }

    this._sendMessage(message)
  }

  private _validateMessage(data: unknown): data is Message {
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

  async _handleIncoming(data: unknown) {
    if (!this._validateMessage(data)) {
      this.logger.error('Invalid message format received', { data })
      this.errorHandler?.(new Error('Invalid message format received'), { data })
      this.metrics.messagesFailed++
      return
    }

    const envelope = data as Message
    const payload = envelope.payload as JsonRpcRequest | JsonRpcResponse | JsonRpcNotification

    if (envelope.to && envelope.to !== this.instanceId) {
      this.logger.debug('Message filtered: not for this instance', {
        messageId: 'id' in payload ? payload.id : undefined,
        to: envelope.to,
        instanceId: this.instanceId,
      })
      return
    }

    if ('result' in payload || 'error' in payload) {
      const response = payload as JsonRpcResponse
      const id = String(response.id)

      if (this.pendingTasks.has(id)) {
        const { resolve, reject, timer, timestamp } = this.pendingTasks.get(id)!
        clearTimeout(timer)
        this.pendingTasks.delete(id)

        const latency = Date.now() - timestamp
        this.metrics.messagesReceived++
        this.metrics.pendingMessages--
        this.metrics.totalLatency += latency
        this.metrics.averageLatency = this.metrics.totalLatency / this.metrics.messagesReceived

        this.logger.debug('Response received', { messageId: id, latency })

        if (response.error) {
          const err = new Error(response.error.message)
          ;(err as any).code = response.error.code
          ;(err as any).data = response.error.data
          reject(err)
        } else {
          resolve(response.result)
        }

        this._notifyMetrics()
      } else {
        this.logger.warn('Orphaned response received', { messageId: id })
      }
      return
    }

    if ('method' in payload) {
      if ('id' in payload) {
        const request = payload as JsonRpcRequest
        const id = String(request.id)

        this.logger.debug('Invoke message received', {
          messageId: id,
          type: request.method,
          from: envelope.from,
        })

        const context: InvokeContext = {
          messageId: id,
          from: envelope.from,
          to: envelope.to,
          metadata: envelope.metadata,
        }

        const handler = this.invokeHandlers.get(request.method)
        if (handler) {
          try {
            const result = await handler(request.params, context)
            this._reply(id, envelope.from, result)
          } catch (error) {
            this._replyError(id, envelope.from, error)
          }
        } else {
          const err = new Error(`Method not found: ${request.method}`)
          ;(err as any).code = -32601 // JSON-RPC Method not found
          this._replyError(id, envelope.from, err)
        }
      } else {
        const notification = payload as JsonRpcNotification

        this.logger.debug('Notification message received', {
          type: notification.method,
          from: envelope.from,
        })

        const context: InvokeContext = {
          from: envelope.from,
          to: envelope.to,
          metadata: envelope.metadata,
        }

        const handlers = this.notificationHandlers.get(notification.method)
        if (handlers) {
          handlers.forEach((handler) => {
            try {
              handler(notification.params, context)
            } catch (error) {
              this.logger.error('Error in notification handler', { error: String(error) })
            }
          })
        }
      }
    }
  }

  getMetrics(): Metrics {
    return { ...this.metrics, pendingMessages: this.pendingTasks.size }
  }

  onMetrics(callback: MetricsCallback) {
    this.metricsCallbacks.add(callback)
    return () => this.metricsCallbacks.delete(callback)
  }

  private _notifyMetrics() {
    const metrics = this.getMetrics()
    this.metricsCallbacks.forEach((callback) => callback(metrics))
  }

  handle<Params = any, Result = any>(method: string, handler: InvokeHandler<Params, Result>) {
    if (this.invokeHandlers.has(method)) {
      this.logger.warn(`Overriding existing handler for method: ${method}`)
    }
    this.invokeHandlers.set(method, handler)
    return () => this.invokeHandlers.delete(method)
  }

  removeHandler(method: string) {
    this.invokeHandlers.delete(method)
  }

  onNotification<Params = any>(method: string, handler: NotificationHandler<Params>) {
    if (!this.notificationHandlers.has(method)) {
      this.notificationHandlers.set(method, new Set())
    }
    this.notificationHandlers.get(method)!.add(handler)
    return () => this.offNotification(method, handler)
  }

  offNotification(method: string, handler: NotificationHandler<any>) {
    const handlers = this.notificationHandlers.get(method)
    if (handlers) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        this.notificationHandlers.delete(method)
      }
    }
  }

  private _reply(messageId: string, to: string, payload: unknown) {
    const rpcResponse: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: messageId,
      result: payload,
    }

    const message: Message = {
      from: this.instanceId,
      to,
      payload: rpcResponse,
    }

    this.driver.send(message)
  }

  private _replyError(messageId: string, to: string, error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error))
    const rpcResponse: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: messageId,
      error: {
        code: (err as any).code || -32000,
        message: err.message,
        data: (err as any).data,
      },
    }

    const message: Message = {
      from: this.instanceId,
      to,
      payload: rpcResponse,
    }

    this.driver.send(message)
  }

  destroy() {
    this.logger.info('MessageNexus destroying', {
      instanceId: this.instanceId,
      pendingMessages: this.pendingTasks.size,
      queuedMessages: this.messageQueue.length,
      metrics: this.getMetrics(),
    })

    this.driver.destroy?.()

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    this.invokeHandlers.clear()
    this.notificationHandlers.clear()
    this.metricsCallbacks.clear()
  }
}

export {
  BaseDriver,
  BroadcastDriver,
  MittDriver,
  PostMessageDriver,
  WebSocketDriver,
  createEmitter,
  LogLevel,
}
export type { Message, LoggerInterface, SimpleLogger }
