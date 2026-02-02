import BaseDriver, { type Message } from './drivers/BaseDriver'
import MittDriver from './drivers/MittDriver'
import PostMessageDriver from './drivers/PostMessageDriver'
import WebSocketDriver from './drivers/WebSocktDriver'
import { Logger, createConsoleHandler } from './utils/logger'
import emitter from './utils/emitter'

interface MessageBridgeOptions {
  instanceId?: string
  timeout?: number
  logger?: Logger
}

interface RequestOptions {
  type: string
  payload?: unknown
  to?: string
  metadata?: Record<string, unknown>
  timeout?: number
  retryCount?: number
  retryDelay?: number
}

export interface CommandMessage extends Message {
  type: string
  payload?: unknown
}

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

export default class MessageBridge<RequestPayload = unknown, ResponsePayload = unknown> {
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
  incomingMessages: Map<string, { from?: string; type: string; timestamp: number }>
  messageHandlers: Set<(data: CommandMessage) => void>
  timeout: number
  instanceId: string
  private cleanupInterval: ReturnType<typeof setInterval> | null = null
  private messageQueue: Message[] = []
  private maxQueueSize: number = 100
  private errorHandler: ErrorHandler | null = null
  private logger: Logger
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

  constructor(driver: BaseDriver, options?: MessageBridgeOptions) {
    this.driver = driver
    this.instanceId = options?.instanceId || crypto.randomUUID()
    this.timeout = options?.timeout ?? 10000
    this.logger = options?.logger || new Logger('MessageBridge')
    this.logger.addHandler(createConsoleHandler())
    this.pendingTasks = new Map()
    this.incomingMessages = new Map()
    this.messageHandlers = new Set()
    this.cleanupInterval = null

    this.driver.onMessage = (data) => this._handleIncoming(data)

    this.logger.info('MessageBridge initialized', {
      instanceId: this.instanceId,
      timeout: this.timeout,
    })

    this.cleanupInterval = window.setInterval(() => {
      const now = Date.now()
      for (const [id, msg] of this.incomingMessages.entries()) {
        if (now - msg.timestamp > this.timeout * 2) {
          this.incomingMessages.delete(id)
        }
      }
    }, 60000)
  }

  async request(typeOrOptions: string | RequestOptions): Promise<ResponsePayload> {
    const id = crypto.randomUUID()

    let type: string
    let payload: unknown
    let to: string | undefined
    let metadata: Record<string, unknown>
    let timeout: number
    let retryCount = 0
    let retryDelay = 1000

    if (typeof typeOrOptions === 'string') {
      type = typeOrOptions
      payload = undefined
      to = undefined
      metadata = {}
      timeout = this.timeout
    } else {
      const opts = typeOrOptions
      type = opts.type
      payload = opts.payload
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
          reject(new Error(`Message timeout: ${type} (${id})`))
        }, timeout)

        this.pendingTasks.set(id, { resolve, reject, timer, timestamp: Date.now() })

        const message: Message = {
          id,
          type,
          payload,
          from: this.instanceId,
          to,
          metadata: { ...metadata, timestamp: Date.now() },
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
    try {
      this.driver.send(message)
      this.metrics.messagesSent++
      this.metrics.pendingMessages++
      this.logger.debug('Message sent', { messageId: message.id, type: message.type })
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.metrics.messagesFailed++
      this.logger.error('Failed to send message', { error: err.message, messageId: message.id })
      this.errorHandler?.(err, { message })

      if (this.messageQueue.length < this.maxQueueSize) {
        this.messageQueue.push(message)
        this.logger.debug('Message queued', {
          messageId: message.id,
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

  private _validateMessage(data: unknown): data is Message {
    if (!data || typeof data !== 'object') return false
    const msg = data as Partial<Message>

    if (typeof msg.id !== 'string') return false
    if (typeof msg.type !== 'string') return false
    if (msg.from && typeof msg.from !== 'string') return false
    if (msg.to && typeof msg.to !== 'string') return false
    if (msg.metadata && typeof msg.metadata !== 'object') return false
    if (msg.isResponse !== undefined && typeof msg.isResponse !== 'boolean') return false

    return true
  }

  _handleIncoming(data: unknown) {
    if (!this._validateMessage(data)) {
      this.logger.error('Invalid message format received', { data })
      this.errorHandler?.(new Error('Invalid message format received'), { data })
      this.metrics.messagesFailed++
      return
    }

    const { id, to, type, payload, isResponse, error, from } = data

    if (to && to !== this.instanceId) {
      this.logger.debug('Message filtered: not for this instance', {
        messageId: id,
        to,
        instanceId: this.instanceId,
      })
      return
    }

    if (isResponse && this.pendingTasks.has(id)) {
      const { resolve, reject, timer, timestamp } = this.pendingTasks.get(id)!
      clearTimeout(timer)
      this.pendingTasks.delete(id)

      const latency = Date.now() - timestamp
      this.metrics.messagesReceived++
      this.metrics.pendingMessages--
      this.metrics.totalLatency += latency
      this.metrics.averageLatency = this.metrics.totalLatency / this.metrics.messagesReceived

      this.logger.debug('Response received', { messageId: id, latency })

      if (error) reject(error)
      else resolve(payload as ResponsePayload)

      this._notifyMetrics()
      return
    }

    if (isResponse) {
      this.logger.warn('Orphaned response received', { messageId: id })
      return
    }

    this.logger.debug('Command message received', { messageId: id, type, from })
    this.incomingMessages.set(id, { from, type, timestamp: Date.now() })
    this.messageHandlers.forEach((handler) => handler(data))
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

  reply(messageId: string, payload: unknown, error?: unknown) {
    const incoming = this.incomingMessages.get(messageId)
    if (!incoming) {
      throw new Error(`Message not found: ${messageId}`)
    }

    const responsePayload = payload
    const responseError = error

    this.driver.send({
      id: messageId,
      type: `${incoming.type}_RESPONSE`,
      payload: responsePayload,
      error: responseError,
      isResponse: true,
      from: this.instanceId,
      to: incoming.from,
    })

    this.incomingMessages.delete(messageId)
  }

  destroy() {
    this.logger.info('MessageBridge destroying', {
      instanceId: this.instanceId,
      pendingMessages: this.pendingTasks.size,
      queuedMessages: this.messageQueue.length,
      metrics: this.getMetrics(),
    })

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
}

export { BaseDriver, MittDriver, PostMessageDriver, WebSocketDriver, emitter }
export type { MessageBridgeOptions, RequestOptions, Message }
