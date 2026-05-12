import type { Message } from '../drivers/BaseDriver'
import type { LoggerInterface, SimpleLogger } from '../utils/logger'

export interface MessageQueueOptions {
  maxQueueSize?: number
  logger?: LoggerInterface | SimpleLogger
  onMessageDropped?: (message: Message) => void
}

export class MessageQueue {
  private queue: Message[] = []
  private maxQueueSize: number
  private logger?: LoggerInterface | SimpleLogger
  private onMessageDropped?: (message: Message) => void

  constructor(options: MessageQueueOptions = {}) {
    this.maxQueueSize = options.maxQueueSize ?? 100
    this.logger = options.logger
    this.onMessageDropped = options.onMessageDropped
  }

  enqueue(message: Message): void {
    if (this.queue.length < this.maxQueueSize) {
      this.queue.push(message)
      if (this.logger && 'debug' in this.logger) {
        this.logger.debug('Message queued', { queueSize: this.queue.length })
      }
    } else {
      if (this.logger && 'warn' in this.logger) {
        this.logger.warn('Message queue full, dropping oldest message', {
          queueSize: this.queue.length,
        })
      }
      const droppedMessage = this.queue.shift()
      if (droppedMessage && this.onMessageDropped) {
        this.onMessageDropped(droppedMessage)
      }
      this.queue.push(message)
    }
  }

  dequeue(): Message | undefined {
    return this.queue.shift()
  }

  unshift(message: Message): void {
    this.queue.unshift(message)
  }

  get length(): number {
    return this.queue.length
  }

  get isFull(): boolean {
    return this.queue.length >= this.maxQueueSize
  }

  get isEmpty(): boolean {
    return this.queue.length === 0
  }

  clear(): void {
    this.queue = []
  }
}
