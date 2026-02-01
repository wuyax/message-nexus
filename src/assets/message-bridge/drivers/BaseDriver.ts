export interface Message {
  id: string
  type: string
  payload?: unknown
  from: string
  to?: string
  metadata?: Record<string, unknown>
  isResponse?: boolean
  error?: unknown
}

export default class BaseDriver {
  onMessage: ((data: Message) => void) | null
  constructor() {
    this.onMessage = null
  }
  send(data: Message) {
    throw new Error('Not implemented')
  }
}
