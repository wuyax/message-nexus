import BaseDriver, { type Message } from './BaseDriver'
import { Logger, createConsoleHandler, LogLevel } from '../utils/logger'

// Protocol identifier to distinguish MessageNexus messages from other WebSocket traffic
const MESSAGE_NEXUS_PROTOCOL = 'message-nexus-v1'

interface ReconnectOptions {
  maxRetries?: number
  retryInterval?: number
  retryDelay?: number
}

export interface WebSocketDriverOptions {
  url: string
  reconnect?: boolean | ReconnectOptions
  logger?: Logger
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void
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
  private onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void

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
    this.onStatusChange = options.onStatusChange

    this.connect()
  }

  private connect() {
    this.onStatusChange?.('connecting')
    this.ws = new WebSocket(this.url)

    this.ws.addEventListener('open', () => {
      this.logger.info('WebSocket connected', { url: this.url })
      this.retryCount = 0
      this.onStatusChange?.('connected')
      this.onConnect?.()
    })

    this.ws.addEventListener('message', (event) => {
      try {
        const rawData = JSON.parse(event.data)
        // Verify protocol and extract message
        if (
          typeof rawData === 'object' &&
          rawData !== null &&
          '__messageBridge' in rawData &&
          rawData.__messageBridge === MESSAGE_NEXUS_PROTOCOL
        ) {
          const { __messageBridge, ...data } = rawData
          this.logger.debug('Message received', { data })
          this.onMessage?.(data as Message)
        } else {
          this.logger.debug('Ignored non-bridge message', { data: rawData })
        }
      } catch (error) {
        this.logger.error('Failed to parse WebSocket message', { error, data: event.data })
      }
    })

    this.ws.addEventListener('error', (event) => {
      this.logger.error('WebSocket error', { event })
      this.onStatusChange?.('error')
    })

    this.ws.addEventListener('close', () => {
      this.logger.info('WebSocket connection closed', {
        manuallyClosed: this.isManuallyClosed,
        retryCount: this.retryCount,
        maxRetries: this.maxRetries,
      })

      if (!this.isManuallyClosed && this.reconnectEnabled && this.retryCount < this.maxRetries) {
        this.scheduleReconnect()
      } else {
        this.onStatusChange?.('disconnected')
      }
      this.onDisconnect?.()
    })
  }

  private scheduleReconnect() {
    this.retryCount++
    
    // Exponential backoff: base * 2^retryCount
    // Cap the maximum delay at 30 seconds (30000ms)
    const MAX_DELAY = 30000
    const calculatedDelay = this.retryInterval * Math.pow(2, this.retryCount)
    const delay = Math.min(calculatedDelay, MAX_DELAY)

    this.logger.info('Reconnecting scheduled', {
      delay,
      attempt: this.retryCount,
      maxRetries: this.maxRetries,
      url: this.url,
    })

    this.onStatusChange?.('connecting')

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
    const bridgeMessage = {
      ...data,
      __messageBridge: MESSAGE_NEXUS_PROTOCOL,
    }
    this.ws.send(JSON.stringify(bridgeMessage))
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
    this.onStatusChange?.('disconnected')
    this.onDisconnect?.()
  }

  destroy() {
    this.close()
    this.onMessage = null
    this.onConnect = null
    this.onDisconnect = null
  }
}
