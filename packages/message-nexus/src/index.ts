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
import { Logger, LoggerInterface, createConsoleHandler, isLogger } from './utils/logger'
import { createEmitter } from './utils/emitter'

interface MessageNexusOptions {
  instanceId?: string
  timeout?: number
  logger?: LoggerInterface
  loggerEnabled?: boolean
}

interface RequestOptions {
  method: string
  params?: unknown
  to?: string
  metadata?: Record<string, unknown>
  timeout?: number
  retryCount?: number
  retryDelay?: number
}

export type CommandMessage = NexusEnvelope<JsonRpcRequest>
export type NotifyMessage = NexusEnvelope<JsonRpcNotification>

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

export default class MessageNexus<RequestPayload = unknown, ResponsePayload = unknown> {
  driver: BaseDriver
  pendingTasks: Map<
    string,
    {
      resolve: (value: ResponsePayload) => void
      reject: (reason?: unknown) => void
      timer: ReturnType<typeof setTimeout>
      to?: string
      timestamp: number
    }
  >
  incomingMessages: Map<string, { from: string; method: string; timestamp: number }>
  messageHandlers: Set<(data: CommandMessage) => void>
  notifyHandlers: Set<(data: NotifyMessage) => void>
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

    if (options?.logger && isLogger(options.logger)) {
      this.logger = options.logger
    } else {
      this.logger = new Logger('MessageNexus')
    }

    const loggerEnabled = options?.loggerEnabled ?? false
    if (loggerEnabled) {
      this.logger.enable()
      this.logger.addHandler(createConsoleHandler())
      this.logger.info('MessageNexus initialized', {
        instanceId: this.instanceId,
        timeout: this.timeout,
      })
    }
    this.pendingTasks = new Map()
    this.incomingMessages = new Map()
    this.messageHandlers = new Set()
    this.notifyHandlers = new Set()
    this.cleanupInterval = null

    this.driver.onMessage = (data) => this._handleIncoming(data)

    this.cleanupInterval = window.setInterval(() => {
      const now = Date.now()
      for (const [id, msg] of this.incomingMessages.entries()) {
        if (now - msg.timestamp > this.timeout * 2) {
          this.incomingMessages.delete(id)
        }
      }
    }, 60000)
  }

  async request(methodOrOptions: string | RequestOptions): Promise<ResponsePayload> {
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

    const attempt = async (attemptNumber: number): Promise<ResponsePayload> => {
      return new Promise<ResponsePayload>((resolve, reject) => {
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
          return new Promise<ResponsePayload>((resolve) =>
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

  notify(methodOrOptions: string | Omit<RequestOptions, 'timeout' | 'retryCount' | 'retryDelay'>) {
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

  _handleIncoming(data: unknown) {
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
          resolve(response.result as ResponsePayload)
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

        this.logger.debug('Command message received', {
          messageId: id,
          type: request.method,
          from: envelope.from,
        })
        this.incomingMessages.set(id, {
          from: envelope.from,
          method: request.method,
          timestamp: Date.now(),
        })

        const commandMessage: CommandMessage = {
          ...envelope,
          payload: request,
        }
        this.messageHandlers.forEach((handler) => handler(commandMessage))
      } else {
        const notification = payload as JsonRpcNotification

        this.logger.debug('Notification message received', {
          type: notification.method,
          from: envelope.from,
        })

        const notifyMessage: NotifyMessage = {
          ...envelope,
          payload: notification,
        }
        this.notifyHandlers.forEach((handler) => handler(notifyMessage))
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

  onCommand(handler: (data: CommandMessage) => void) {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  onNotify(handler: (data: NotifyMessage) => void) {
    this.notifyHandlers.add(handler)
    return () => this.notifyHandlers.delete(handler)
  }

  reply(messageId: string, payload: unknown, error?: unknown) {
    const incoming = this.incomingMessages.get(messageId)
    if (!incoming) {
      throw new Error(`Message not found: ${messageId}`)
    }

    let rpcResponse: JsonRpcResponse

    if (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      rpcResponse = {
        jsonrpc: '2.0',
        id: messageId,
        error: {
          code: (err as any).code || -32000,
          message: err.message,
          data: (err as any).data,
        },
      }
    } else {
      rpcResponse = {
        jsonrpc: '2.0',
        id: messageId,
        result: payload,
      }
    }

    const message: Message = {
      from: this.instanceId,
      to: incoming.from,
      payload: rpcResponse,
    }

    this.driver.send(message)
    this.incomingMessages.delete(messageId)
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

    this.messageHandlers.clear()
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
}
export type { MessageNexusOptions, RequestOptions, Message, LoggerInterface }
