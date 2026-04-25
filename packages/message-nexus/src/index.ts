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

/**
 * Interface representing a method schema with parameters and results.
 */
export interface MethodSchema {
  params?: any
  result?: any
}

/**
 * Default registry for method schemas.
 */
export type DefaultRegistry = Record<string, MethodSchema>

/**
 * Helper to extract params from a schema or return any if not present.
 */
type GetParams<T> = T extends { params: infer P } ? P : any

/**
 * Helper to extract result from a schema or return any if not present.
 */
type GetResult<T> = T extends { result: infer R } ? R : any

/**
 * Options for invoking a method.
 */
export interface InvokeOptions<K extends string = string, P = any> {
  method: K
  params?: P
  to?: string
  metadata?: Record<string, unknown>
  timeout?: number
  retryCount?: number
  retryDelay?: number
}

/**
 * Options for sending a notification.
 */
export interface NotificationOptions<K extends string = string, P = any> {
  method: K
  params?: P
  to?: string
  metadata?: Record<string, unknown>
}

export interface InvokeContext {
  messageId?: string
  from: string
  to?: string
  metadata?: Record<string, unknown>
}

/**
 * Handler for an invoked method.
 */
export type InvokeHandler<P = any, R = any> = (
  params: P,
  context: InvokeContext,
) => R | Promise<R>

/**
 * Handler for a notification.
 */
export type NotificationHandler<P = any> = (params: P, context: InvokeContext) => void

/**
 * Standard JSON-RPC 2.0 and Nexus-specific error codes.
 */
enum NexusErrorCode {
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
class NexusError<D = any> extends Error {
  public readonly code: number
  public readonly data?: D

  constructor(message: string, code: number = NexusErrorCode.InternalError, data?: D) {
    super(message)
    this.name = 'NexusError'
    this.code = code
    this.data = data
    // Ensure the prototype is correctly set for inheritance in all environments
    Object.setPrototypeOf(this, NexusError.prototype)
  }
}

export type ErrorHandler = (error: Error | NexusError, context?: Record<string, unknown>) => void

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

export default class MessageNexus<
  InvokeMap extends object = DefaultRegistry,
  NotificationMap extends object = Record<string, any>,
> {
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
    this.driver.onConnect = () => {
      this.logger.info('Driver connected, flushing message queue')
      this.flushQueue()
    }
  }

  async invoke<K extends keyof InvokeMap>(
    methodOrOptions: K | InvokeOptions<K & string, GetParams<InvokeMap[K]>>,
  ): Promise<GetResult<InvokeMap[K]>> {
    const id = crypto.randomUUID()

    let method: string
    let params: unknown
    let to: string | undefined
    let metadata: Record<string, unknown>
    let timeout: number
    let retryCount = 0
    let retryDelay = 1000

    if (typeof methodOrOptions === 'string') {
      method = methodOrOptions as string
      params = undefined
      to = undefined
      metadata = {}
      timeout = this.timeout
    } else {
      const opts = methodOrOptions as InvokeOptions
      method = opts.method
      params = opts.params
      to = opts.to
      metadata = opts.metadata || {}
      timeout = opts.timeout ?? this.timeout
      retryCount = opts.retryCount ?? 0
      retryDelay = opts.retryDelay ?? 1000
    }

    const attempt = async (attemptNumber: number): Promise<GetResult<InvokeMap[K]>> => {
      return new Promise<GetResult<InvokeMap[K]>>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingTasks.delete(id)
          this.metrics.messagesFailed++
          this.metrics.pendingMessages--
          reject(new NexusError(`Message timeout: ${method} (${id})`, NexusErrorCode.Timeout))
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

        const isFinalAttempt = attemptNumber >= retryCount
        this._sendMessage(message, !isFinalAttempt)
      }).catch((error) => {
        if (attemptNumber < retryCount) {
          return new Promise<GetResult<InvokeMap[K]>>((resolve) =>
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

  private _sendMessage(message: Message, skipQueue: boolean = false) {
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

      if (!skipQueue) {
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
      } else {
        this.logger.debug('Message failed but skipQueue is true (likely retrying)', { messageId })
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
    this.metrics.queuedMessages = this.messageQueue.length
    this._notifyMetrics()
  }

  notify<K extends keyof NotificationMap>(
    methodOrOptions: K | NotificationOptions<K & string, NotificationMap[K]>,
  ) {
    let method: string
    let params: unknown
    let to: string | undefined
    let metadata: Record<string, unknown>

    if (typeof methodOrOptions === 'string') {
      method = methodOrOptions as string
      params = undefined
      to = undefined
      metadata = {}
    } else {
      const opts = methodOrOptions as NotificationOptions
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
          const err = new NexusError(
            response.error.message,
            response.error.code,
            response.error.data,
          )
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
          const err = new NexusError(`Method not found: ${request.method}`, NexusErrorCode.MethodNotFound)
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

  handle<K extends keyof InvokeMap>(
    method: K,
    handler: InvokeHandler<GetParams<InvokeMap[K]>, GetResult<InvokeMap[K]>>,
  ) {
    if (this.invokeHandlers.has(method as string)) {
      this.logger.warn(`Overriding existing handler for method: ${method as string}`)
    }
    this.invokeHandlers.set(method as string, handler as InvokeHandler)
    return () => this.invokeHandlers.delete(method as string)
  }

  removeHandler(method: keyof InvokeMap) {
    this.invokeHandlers.delete(method as string)
  }

  onNotification<K extends keyof NotificationMap>(
    method: K,
    handler: NotificationHandler<NotificationMap[K]>,
  ) {
    if (!this.notificationHandlers.has(method as string)) {
      this.notificationHandlers.set(method as string, new Set())
    }
    this.notificationHandlers.get(method as string)!.add(handler as NotificationHandler)
    return () => this.offNotification(method, handler)
  }

  offNotification<K extends keyof NotificationMap>(
    method: K,
    handler: NotificationHandler<NotificationMap[K]>,
  ) {
    const handlers = this.notificationHandlers.get(method as string)
    if (handlers) {
      handlers.delete(handler as NotificationHandler)
      if (handlers.size === 0) {
        this.notificationHandlers.delete(method as string)
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
    const err = error instanceof NexusError ? error : 
                error instanceof Error ? new NexusError(error.message, NexusErrorCode.InternalError) :
                new NexusError(String(error), NexusErrorCode.InternalError)

    const rpcResponse: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: messageId,
      error: {
        code: err.code,
        message: err.message,
        data: err.data,
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
  NexusError,
  NexusErrorCode,
}
export type { Message, LoggerInterface, SimpleLogger }
