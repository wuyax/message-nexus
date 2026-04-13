import type { Emitter, EventType } from 'mitt'
import BaseDriver, { type Message } from './BaseDriver'

const NEXUS_INTERNAL_EVENT = Symbol('message_nexus_internal')

export default class MittDriver extends BaseDriver {
  private emitter: Emitter<Record<EventType, Message>>
  private listener: () => void

  constructor(emitter: Emitter<Record<EventType, Message>>) {
    super()
    this.emitter = emitter
    this.listener = () => {
      // This empty function is used as a reference for off()
    }
    const handler = (data: unknown) => {
      if (data) this.onMessage?.(data as Message)
    }
    this.emitter.on(NEXUS_INTERNAL_EVENT, handler)
    // Store the handler reference for cleanup
    this.listener = () => {
      this.emitter.off(NEXUS_INTERNAL_EVENT, handler)
    }
  }

  send(data: Message) {
    this.emitter.emit(NEXUS_INTERNAL_EVENT, data)
  }

  destroy() {
    this.listener()
    this.onMessage = null
  }
}
