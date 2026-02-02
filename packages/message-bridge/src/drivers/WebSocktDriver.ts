import BaseDriver, { type Message } from './BaseDriver'
import { Logger, createConsoleHandler, LogLevel } from '../utils/logger'

interface ReconnectOptions {
  maxRetries?: number
  retryInterval?: number
  retryDelay?: number
}

export interface WebSocketDriverOptions {
  url: string
  reconnect?: boolean | ReconnectOptions
  logger?: Logger
}

export default class WebSocketDriver extends BaseDriver {
  private url: string
  private ws: WebSocket | null = null
  private reconnectEnabled: boolean
  private maxRetries: number
  private retryInterval: number
  private retryCount: number = 0
  private reconnectTimer: number | null = null
  private isManuallyClosed: boolean = false
  private logger: Logger

  constructor(options: WebSocketDriverOptions) {
    super()
    this.url = options.url
    this.reconnectEnabled = options.reconnect !== false
    this.maxRetries =
      (typeof options.reconnect === 'object' ? options.reconnect.maxRetries : undefined) ?? Infinity
    this.retryInterval =
      (typeof options.reconnect === 'object' ? options.reconnect.retryInterval : undefined) ?? 5000

    this.logger = options.logger || new Logger('WebSocketDriver')
    this.logger.addHandler(createConsoleHandler())

    this.connect()
  }

  private connect() {
    this.ws = new WebSocket(this.url)

    this.ws.addEventListener('open', () => {
      this.logger.info('WebSocket connected', { url: this.url })
      this.retryCount = 0
    })

    this.ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data) as Message
        this.logger.debug('Message received', { data })
        this.onMessage?.(data)
      } catch (error) {
        this.logger.error('Failed to parse WebSocket message', { error, data: event.data })
      }
    })

    this.ws.addEventListener('error', (event) => {
      this.logger.error('WebSocket error', { event })
    })

    this.ws.addEventListener('close', () => {
      this.logger.info('WebSocket connection closed', {
        manuallyClosed: this.isManuallyClosed,
        retryCount: this.retryCount,
        maxRetries: this.maxRetries,
      })

      if (!this.isManuallyClosed && this.reconnectEnabled && this.retryCount < this.maxRetries) {
        this.scheduleReconnect()
      }
    })
  }

  private scheduleReconnect() {
    this.retryCount++
    const delay = this.retryInterval * this.retryCount

    this.logger.info('Reconnecting scheduled', {
      delay,
      attempt: this.retryCount,
      maxRetries: this.maxRetries,
      url: this.url,
    })

    this.reconnectTimer = window.setTimeout(() => {
      this.connect()
    }, delay)
  }

  send(data: Message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.error('WebSocket is not open', {
        state: this.ws?.readyState,
        url: this.url,
      })
      throw new Error('WebSocket is not open')
    }
    this.logger.debug('Sending message', { data })
    this.ws.send(JSON.stringify(data))
  }

  close() {
    this.logger.info('Closing WebSocket connection', { url: this.url })
    this.isManuallyClosed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}
