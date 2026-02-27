import type { Emitter } from 'mitt'
import BaseDriver, { type Message } from './BaseDriver'

const eventIndicator = 'message_nexus_message_event'

export default class MittDriver extends BaseDriver {
  private emitter: Emitter<Record<string, Message>>
  private listener: () => void

  constructor(emitter: Emitter<Record<string, Message>>) {
    super()
    this.emitter = emitter
    this.listener = () => {
      // This empty function is used as a reference for off()
    }
    const handler = (data: unknown) => {
      if (data) this.onMessage?.(data as Message)
    }
    this.emitter.on(eventIndicator, handler)
    // Store the handler reference for cleanup
    this.listener = () => {
      this.emitter.off(eventIndicator, handler)
    }
  }

  send(data: Message) {
    this.emitter.emit(eventIndicator, data)
  }

  destroy() {
    this.listener()
    this.onMessage = null
  }
}
