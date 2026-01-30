import BaseDriver from './drivers/BaseDriver'
import MittDriver from './drivers/MittDriver'
import PostMessageDriver from './drivers/PostMessageDriver'
import WebSocketDriver from './drivers/WebSocktDriver'

interface MessageBridgeOptions {
  instanceId?: string
  timeout?: number
}

interface RequestOptions {
  type: string
  payload?: any
  to?: string
  metadata?: Record<string, any>
  timeout?: number
}

export default class MessageBridge {
  driver: BaseDriver
  pendingTasks: Map<
    string,
    { resolve: (value: any) => void; reject: (reason?: any) => void; timer: number; to?: string }
  >
  incomingMessages: Map<string, { from?: string; type: string }>
  messageHandlers: Set<(data: any) => void>
  timeout: number
  instanceId: string

  constructor(driver: BaseDriver, options?: MessageBridgeOptions) {
    this.driver = driver
    this.instanceId = options?.instanceId || crypto.randomUUID()
    this.timeout = options?.timeout ?? 10000
    this.pendingTasks = new Map()
    this.incomingMessages = new Map()
    this.messageHandlers = new Set()

    this.driver.onMessage = (data) => this._handleIncoming(data)
  }

  async request(typeOrOptions: string | RequestOptions) {
    const id = crypto.randomUUID()

    let type: string
    let payload: any
    let to: string | undefined
    let metadata: Record<string, any>
    let timeout: number

    if (typeof typeOrOptions === 'string') {
      type = typeOrOptions
      payload = undefined
      to = undefined
      metadata = {}
      timeout = this.timeout
    } else {
      const opts = typeOrOptions
      type = opts.type
      payload = opts.payload
      to = opts.to
      metadata = opts.metadata || {}
      timeout = opts.timeout ?? this.timeout
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingTasks.delete(id)
        reject(new Error(`Message timeout: ${type} (${id})`))
      }, timeout)

      this.pendingTasks.set(id, { resolve, reject, timer })

      this.driver.send({
        id,
        type,
        payload,
        from: this.instanceId,
        to,
        metadata: { ...metadata, timestamp: Date.now() },
      })
    })
  }

  _handleIncoming(data: any) {
    const { id, to, type, payload, isResponse, error, from } = data

    if (to && to !== this.instanceId) {
      return
    }

    if (isResponse && this.pendingTasks.has(id)) {
      const { resolve, reject, timer } = this.pendingTasks.get(id)!
      clearTimeout(timer)
      this.pendingTasks.delete(id)

      if (error) reject(error)
      else resolve(payload)
      return
    }

    if (isResponse) {
      return
    }

    this.incomingMessages.set(id, { from, type })
    this.messageHandlers.forEach((handler) => handler(data))
  }

  // 监听被动指令 (A服务使用)
  onCommand(handler: (data: any) => void) {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler) // 返回取消监听函数
  }

  reply(messageId: string, payload: any, error?: any) {
    const incoming = this.incomingMessages.get(messageId)
    if (!incoming) {
      throw new Error(`Message not found: ${messageId}`)
    }

    const responsePayload = payload
    const responseError = error

    this.driver.send({
      id: messageId,
      type: `${incoming.type}_RESPONSE`,
      payload: responsePayload,
      error: responseError,
      isResponse: true,
      from: this.instanceId,
      to: incoming.from,
    })
  }
}

export { BaseDriver, MittDriver, PostMessageDriver, WebSocketDriver }
export type { MessageBridgeOptions, RequestOptions }
