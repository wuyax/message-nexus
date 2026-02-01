import type { Emitter } from 'mitt'
import BaseDriver, { type Message } from './BaseDriver'

export default class MittDriver extends BaseDriver {
  emitter: Emitter<Record<string, Message>>
  constructor(emitter: Emitter<Record<string, Message>>) {
    super()
    this.emitter = emitter
    this.emitter.on('message', (data) => {
      if (data) this.onMessage?.(data)
    })
  }
  send(data: Message) {
    this.emitter.emit('message', data)
  }
}
