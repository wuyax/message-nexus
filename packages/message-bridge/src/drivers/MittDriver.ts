import type { Emitter } from 'mitt'
import BaseDriver, { type Message } from './BaseDriver'

const eventIndicator = 'message_bridge_message_event'

export default class MittDriver extends BaseDriver {
  emitter: Emitter<Record<string, Message>>
  constructor(emitter: Emitter<Record<string, Message>>) {
    super()
    this.emitter = emitter
    this.emitter.on(eventIndicator, (data) => {
      if (data) this.onMessage?.(data)
    })
  }
  send(data: Message) {
    this.emitter.emit(eventIndicator, data)
  }
}
