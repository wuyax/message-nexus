import BaseDriver, { type Message } from './BaseDriver'

export default class PostMessageDriver extends BaseDriver {
  targetWindow: Window
  targetOrigin: string
  constructor(targetWindow: Window, targetOrigin: string) {
    super()

    if (!targetOrigin || targetOrigin === '*') {
      throw new Error(
        'PostMessageDriver requires explicit targetOrigin for security. Do not use "*" as it allows any origin.',
      )
    }

    this.targetWindow = targetWindow
    this.targetOrigin = targetOrigin

    window.addEventListener('message', (event) => {
      if (event.origin !== this.targetOrigin) {
        return
      }
      this.onMessage?.(event.data as Message)
    })
  }

  send(data: Message) {
    this.targetWindow.postMessage(data, this.targetOrigin)
  }
}
