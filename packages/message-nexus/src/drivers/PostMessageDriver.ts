import BaseDriver, { type Message } from './BaseDriver'
import { MESSAGE_NEXUS_PROTOCOL } from '../utils/constants'
import { NexusError, NexusErrorCode } from '../errors'

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

export default class PostMessageDriver extends BaseDriver {
  targetWindow: Window
  targetOrigin: string
  private messageHandler: ((event: MessageEvent) => void) | null = null
  constructor(targetWindow: Window, targetOrigin: string) {
    super()

    if (!targetOrigin || targetOrigin === '*') {
      throw new Error(
        'PostMessageDriver requires explicit targetOrigin for security. Do not use "*" as it allows any origin.',
      )
    }

    this.targetWindow = targetWindow
    this.targetOrigin = targetOrigin

    this.messageHandler = (event) => {
      if (event.origin !== this.targetOrigin) {
        return
      }
      if (!isBridgeMessage(event.data)) {
        return
      }
      const { __messageBridge, ...message } = event.data
      this.onMessage?.(message as Message)
    }
    window.addEventListener('message', this.messageHandler)
  }

  send(data: Message) {
    const bridgeMessage: BridgeMessage = {
      ...data,
      __messageBridge: MESSAGE_NEXUS_PROTOCOL,
    }
    try {
      this.targetWindow.postMessage(bridgeMessage, this.targetOrigin)
    } catch (error) {
      if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'DataCloneError') {
        throw new NexusError('Message payload cannot be cloned', NexusErrorCode.InvalidParams)
      }
      throw error
    }
  }

  destroy() {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler)
      this.messageHandler = null
    }
    this.onMessage = null
  }
}
