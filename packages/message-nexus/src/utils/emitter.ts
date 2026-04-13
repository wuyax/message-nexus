import mitt, { type Emitter, type EventType } from 'mitt'
import type { Message } from '../drivers/BaseDriver'

export { type Emitter, type EventType }

export function createEmitter() {
  return mitt<Record<EventType, Message>>()
}
