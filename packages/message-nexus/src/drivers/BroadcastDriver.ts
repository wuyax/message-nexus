import BaseDriver, { type Message } from './BaseDriver'
import { MESSAGE_NEXUS_PROTOCOL } from '../utils/constants'

export interface BridgeMessage extends Message {
  __messageBridge: typeof MESSAGE_NEXUS_PROTOCOL
}

function isBridgeMessage(data: unknown): data is BridgeMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    '__messageBridge' in data &&
    (data as Record<string, unknown>).__messageBridge === MESSAGE_NEXUS_PROTOCOL
  )
}

export interface BroadcastDriverOptions {
  channel: string
}

export default class BroadcastDriver extends BaseDriver {
  private channel: BroadcastChannel
  private messageHandler: ((event: MessageEvent) => void) | null = null

  constructor(options: BroadcastDriverOptions) {
    super()

    if (!options.channel) {
      throw new Error('BroadcastDriver requires a channel name')
    }

    this.channel = new BroadcastChannel(options.channel)

    this.messageHandler = (event: MessageEvent) => {
      if (!isBridgeMessage(event.data)) {
        return
      }
      const { __messageBridge, ...message } = event.data
      this.onMessage?.(message as Message)
    }

    this.channel.addEventListener('message', this.messageHandler)
  }

  send(data: Message) {
    const bridgeMessage: BridgeMessage = {
      ...data,
      __messageBridge: MESSAGE_NEXUS_PROTOCOL,
    }
    this.channel.postMessage(bridgeMessage)
  }

  destroy() {
    if (this.channel) {
      this.channel.close()
    }
    if (this.messageHandler) {
      this.channel.removeEventListener('message', this.messageHandler)
      this.messageHandler = null
    }
    this.onMessage = null
  }
}
