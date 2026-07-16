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
import WebSocketDriver from './drivers/WebSocketDriver'
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
import { NexusError, NexusErrorCode } from './errors'
import { safeExecute } from './utils/safe'

import { MessageQueue } from './core/MessageQueue'
import { RpcScheduler } from './core/RpcScheduler'
import { MiddlewarePipeline, type MiddlewareContext } from './core/MiddlewarePipeline'
import { EventRouter, type InvokeContext, type InvokeHandler, type NotificationHandler } from './core/EventRouter'

export interface MessageNexusOptions {
  instanceId?: string
  timeout?: number
  maxQueueSize?: number
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
 * Helper to extract params from a schema or return unknown if not present.
 */
type GetParams<T> = T extends { params: infer P } ? P : unknown

/**
 * Helper to extract result from a schema or return unknown if not present.
 */
type GetResult<T> = T extends { result: infer R } ? R : unknown

/**
 * Options for invoking a method.
 */
export interface InvokeOptions<K extends string = string, P = unknown> {
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
export interface NotificationOptions<K extends string = string, P = unknown> {
  method: K
  params?: P
  to?: string
  metadata?: Record<string, unknown>
}

export type ErrorHandler = (error: Error | NexusError, context?: Record<string, unknown>) => void

export type RequestInterceptor = (message: Message) => Message | Promise<Message>
export type ResponseInterceptor = (message: Message) => Message | Promise<Message>

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
  timeout: number
  instanceId: string

  private queue: MessageQueue
  private scheduler: RpcScheduler
  private requestPipeline: MiddlewarePipeline
  private responsePipeline: MiddlewarePipeline
  private router: EventRouter<InvokeMap, NotificationMap>
  
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
  private metricsThrottleTimer: ReturnType<typeof setTimeout> | null = null
  private _isDestroyed: boolean = false

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

    this.queue = new MessageQueue({
      maxQueueSize: options?.maxQueueSize ?? 100,
      logger: this.logger,
      onMessageDropped: (droppedMessage) => {
        const payload = droppedMessage.payload as any
        if (payload && 'id' in payload) {
          const droppedId = String(payload.id)
          this.scheduler.rejectTask(droppedId, new NexusError('Message dropped due to queue overflow', NexusErrorCode.SendFailed))
        }
      }
    })

    this.scheduler = new RpcScheduler({
      defaultTimeout: this.timeout
    })

    this.requestPipeline = new MiddlewarePipeline()
    this.responsePipeline = new MiddlewarePipeline()
    this.router = new EventRouter<InvokeMap, NotificationMap>()

    if (loggerEnabled) {
      this.logger.enable()
      this.logger.info('MessageNexus initialized', {
        instanceId: this.instanceId,
        timeout: this.timeout,
        logLevel,
      })
    }

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
      try {
        const promise = this.scheduler.createTask<GetResult<InvokeMap[K]>>(
          id, method, timeout, 
          () => {
            this.metrics.messagesFailed++
          }
        )

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
        this._sendMessage(message, !isFinalAttempt).catch(() => {
          // Error is already handled inside _sendMessage
        })

        return await promise
      } catch (error) {
        if (this._isDestroyed) {
          throw error
        }
        if (attemptNumber < retryCount) {
          return new Promise<GetResult<InvokeMap[K]>>((resolve) =>
            setTimeout(() => resolve(attempt(attemptNumber + 1)), retryDelay * (attemptNumber + 1)),
          )
        }
        this.metrics.messagesFailed++
        throw error
      }
    }

    return attempt(0)
  }

  private async _sendMessage(message: Message, skipQueue: boolean = false) {
    const ctx: MiddlewareContext = {
      message,
      direction: 'outbound',
      nexusInstanceId: this.instanceId
    }

    try {
      if (!this.requestPipeline.isEmpty) {
        await this.requestPipeline.execute(ctx)
      }
    } catch (err) {
      this.logger.error('Request interceptor failed', { error: String(err) })
      this.metrics.messagesFailed++
      const wrappedErr = err instanceof Error ? err : new Error(String(err))
      safeExecute(() => this.errorHandler?.(wrappedErr, { message: ctx.message }))
      
      const payload = ctx.message.payload as any
      if (payload && 'id' in payload) {
        this.scheduler.rejectTask(String(payload.id), err instanceof Error ? err : new Error(String(err)))
      }
      return
    }

    const finalMessage = ctx.message
    const payload = finalMessage.payload as JsonRpcRequest | JsonRpcResponse | JsonRpcNotification
    const isRequest = 'method' in payload
    const messageId = 'id' in payload ? String(payload.id) : undefined
    const typeOrMethod = isRequest ? payload.method : 'RESPONSE'

    try {
      this.driver.send(finalMessage)
      this.metrics.messagesSent++
      this.logger.debug('Message sent', { messageId, type: typeOrMethod })
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.metrics.messagesFailed++
      this.logger.error('Failed to send message', { error: err.message, messageId })
      safeExecute(() => this.errorHandler?.(err, { message: finalMessage }))

      const isDataError = err.name === 'NexusError' && (err as NexusError).code === NexusErrorCode.InvalidParams && err.message === 'Message payload cannot be cloned'

      if (!skipQueue && !isDataError) {
        this.queue.enqueue(finalMessage)
      } else {
        this.logger.debug(
          isDataError ? 'Message dropped due to data error' : 'Message failed but skipQueue is true (likely retrying)',
          { messageId },
        )
      }
    }
    this._notifyMetrics()
  }

  useRequestInterceptor(interceptor: RequestInterceptor) {
    return this.requestPipeline.use(async (ctx, next) => {
      ctx.message = await Promise.race([
        interceptor(ctx.message),
        new Promise<Message>((_, reject) =>
          setTimeout(() => reject(new Error('Request interceptor timed out')), 3000)
        )
      ])
      await next()
    })
  }

  useResponseInterceptor(interceptor: ResponseInterceptor) {
    return this.responsePipeline.use(async (ctx, next) => {
      ctx.message = await Promise.race([
        interceptor(ctx.message),
        new Promise<Message>((_, reject) =>
          setTimeout(() => reject(new Error('Response interceptor timed out')), 3000)
        )
      ])
      await next()
    })
  }

  onError(handler: ErrorHandler) {
    this.errorHandler = handler
    return () => {
      this.errorHandler = null
    }
  }

  flushQueue() {
    while (!this.queue.isEmpty) {
      const message = this.queue.dequeue()
      if (message) {
        try {
          this.driver.send(message)
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error))
          const isDataError = err.name === 'NexusError' && (err as NexusError).code === NexusErrorCode.InvalidParams && err.message === 'Message payload cannot be cloned'
          if (isDataError) {
            this.logger.error('Message payload cannot be cloned during flush, dropping', {
              error: err.message,
            })
            continue
          }
          this.queue.unshift(message)
          break
        }
      }
    }
    this._notifyMetrics(true)
  }

  async notify<K extends keyof NotificationMap>(
    methodOrOptions: K | NotificationOptions<K & string, NotificationMap[K]>,
  ): Promise<void> {
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

    await this._sendMessage(message)
  }

  async _handleIncoming(data: unknown) {
    if (!EventRouter.validateMessage(data)) {
      this.logger.error('Invalid message format received', { data })
      safeExecute(() => this.errorHandler?.(new Error('Invalid message format received'), { data }))
      this.metrics.messagesFailed++
      return
    }

    const ctx: MiddlewareContext = {
      message: data as any,
      direction: 'inbound',
      nexusInstanceId: this.instanceId
    }

    try {
      if (!this.responsePipeline.isEmpty) {
        await this.responsePipeline.execute(ctx)
      }
    } catch (err) {
      this.logger.error('Response interceptor failed', { error: String(err) })
      this.metrics.messagesFailed++
      const wrappedErr = err instanceof Error ? err : new Error(String(err))
      safeExecute(() => this.errorHandler?.(wrappedErr, { message: ctx.message }))
      return
    }

    const envelope = ctx.message
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

      if (this.scheduler.hasTask(id)) {
        let latencyInfo
        if (response.error) {
          const err = new NexusError(
            response.error.message,
            response.error.code,
            response.error.data,
            response.error.name,
            response.error.stack,
          )
          latencyInfo = this.scheduler.rejectTask(id, err)
        } else {
          latencyInfo = this.scheduler.resolveTask(id, response.result)
        }

        if (latencyInfo) {
          this.metrics.messagesReceived++
          this.metrics.totalLatency += latencyInfo.latency
          this.metrics.averageLatency = this.metrics.totalLatency / this.metrics.messagesReceived
          this.logger.debug('Response received', { messageId: id, latency: latencyInfo.latency })
          this._notifyMetrics()
        }
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

        const handler = this.router.getInvokeHandler(request.method)
        if (handler) {
          try {
            const result = await handler(request.params, context)
            await this._reply(id, envelope.from, result)
          } catch (error) {
            await this._replyError(id, envelope.from, error)
          }
        } else {
          const err = new NexusError(`Method not found: ${request.method}`, NexusErrorCode.MethodNotFound)
          await this._replyError(id, envelope.from, err)
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

        const handlers = this.router.getNotificationHandlers(notification.method)
        if (handlers) {
          handlers.forEach((handler) => {
            safeExecute(() => handler(notification.params, context), (error) => {
              this.logger.error('Error in notification handler', { error: String(error) })
            })
          })
        }
      }
    }
  }

  getMetrics(): Metrics {
    return { 
      ...this.metrics, 
      pendingMessages: this.scheduler.size,
      queuedMessages: this.queue.length
    }
  }

  /**
   * Returns the number of messages currently in the offline queue.
   */
  getQueueLength(): number {
    return this.queue.length
  }

  /**
   * Returns a snapshot of the current message queue.
   */
  getQueueSnapshot(): Message[] {
    // Return a shallow copy to prevent external mutation of the internal queue
    return (this.queue as any).queue.slice()
  }

  /**
   * Returns the number of pending RPC tasks waiting for a response.
   */
  getPendingTasksCount(): number {
    return this.scheduler.size
  }

  /**
   * Returns the number of registered invoke handlers.
   */
  getHandlersCount(): number {
    return this.router.invokeHandlersCount
  }

  /**
   * Returns the number of registered notification methods.
   */
  getNotificationMethodsCount(): number {
    return this.router.notificationHandlersCount
  }

  /**
   * Returns true if a specific invoke handler is registered.
   */
  hasHandler(method: string): boolean {
    return this.router.hasInvokeHandler(method)
  }

  onMetrics(callback: MetricsCallback) {
    this.metricsCallbacks.add(callback)
    return () => this.metricsCallbacks.delete(callback)
  }

  private _notifyMetrics(force = false) {
    if (force) {
      if (this.metricsThrottleTimer) {
        clearTimeout(this.metricsThrottleTimer)
        this.metricsThrottleTimer = null
      }
      const metrics = this.getMetrics()
      this.metricsCallbacks.forEach((callback) => {
        safeExecute(() => callback(metrics), (err) => {
          this.logger.error('Error in metrics callback', { error: String(err) })
        })
      })
      return
    }

    if (!this.metricsThrottleTimer) {
      this.metricsThrottleTimer = setTimeout(() => {
        this.metricsThrottleTimer = null
        const metrics = this.getMetrics()
        this.metricsCallbacks.forEach((callback) => {
          safeExecute(() => callback(metrics), (err) => {
            this.logger.error('Error in metrics callback', { error: String(err) })
          })
        })
      }, 100)
    }
  }

  handle<K extends keyof InvokeMap>(
    method: K,
    handler: InvokeHandler<GetParams<InvokeMap[K]>, GetResult<InvokeMap[K]>>,
  ) {
    if (this.router.hasInvokeHandler(method as string)) {
      this.logger.warn(`Overriding existing handler for method: ${method as string}`)
    }
    return this.router.handle(method as string, handler as InvokeHandler<any, any>)
  }

  removeHandler(method: keyof InvokeMap) {
    this.router.removeHandler(method as string)
  }

  onNotification<K extends keyof NotificationMap>(
    method: K,
    handler: NotificationHandler<NotificationMap[K]>,
  ) {
    return this.router.onNotification(method as string, handler as NotificationHandler<any>)
  }

  offNotification<K extends keyof NotificationMap>(
    method: K,
    handler: NotificationHandler<NotificationMap[K]>,
  ) {
    this.router.offNotification(method as string, handler as NotificationHandler<any>)
  }

  private async _reply(messageId: string, to: string, payload: unknown) {
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

    await this._sendMessage(message)
  }

  private async _replyError(messageId: string, to: string, error: unknown) {
    const err = error instanceof NexusError ? error : 
                error instanceof Error ? new NexusError(error.message, NexusErrorCode.InternalError, undefined, error.name, error.stack) :
                new NexusError(String(error), NexusErrorCode.InternalError)

    const rpcResponse: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: messageId,
      error: {
        code: err.code,
        message: err.message,
        data: err.data,
        name: err.name,
        stack: err.stack,
      },
    }

    const message: Message = {
      from: this.instanceId,
      to,
      payload: rpcResponse,
    }

    await this._sendMessage(message)
  }

  /**
   * Clears registered handlers by type.
   * @param type The type of handlers to clear: 'invoke', 'notification', or 'all' (default).
   */
  clearHandlers(type: 'invoke' | 'notification' | 'all' = 'all'): void {
    if (type === 'all') {
      this.router.clear()
    } else {
      this.router.clear(type)
    }
    this.logger.info(`Cleared handlers of type: ${type}`)
  }

  destroy() {
    this._isDestroyed = true
    if (this.metricsThrottleTimer) {
      clearTimeout(this.metricsThrottleTimer)
      this.metricsThrottleTimer = null
    }
    this._notifyMetrics(true)
    
    this.logger.info('MessageNexus destroying', {
      instanceId: this.instanceId,
      pendingMessages: this.scheduler.size,
      queuedMessages: this.queue.length,
      metrics: this.getMetrics(),
    })

    this.driver.destroy?.()

    this.scheduler.clearTasks(new NexusError('MessageNexus instance destroyed', NexusErrorCode.InstanceDestroyed))
    this.queue.clear()
    this.router.clear()
    this.requestPipeline.clear()
    this.responsePipeline.clear()
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
export {
  MessageQueue,
  RpcScheduler,
  MiddlewarePipeline,
  EventRouter
}
export type { Message, LoggerInterface, SimpleLogger, InvokeContext, InvokeHandler, NotificationHandler, MiddlewareContext }
