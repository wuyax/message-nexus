import type { Emitter } from 'mitt'
import BaseDriver from './BaseDriver'

export default class MittDriver extends BaseDriver {
  emitter: Emitter<any>
  constructor(emitter: Emitter<any>) {
    super()
    this.emitter = emitter
    this.emitter.on('message', (data) => this.onMessage?.(data))
  }
  send(data: any) {
    this.emitter.emit('message', data)
  }
}
