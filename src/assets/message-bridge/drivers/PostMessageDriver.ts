import BaseDriver from './BaseDriver'

export default class PostMessageDriver extends BaseDriver {
  targetWindow: Window
  targetOrigin: string
  constructor(targetWindow: Window, targetOrigin: string = '*') {
    super()
    this.targetWindow = targetWindow
    this.targetOrigin = targetOrigin

    window.addEventListener('message', (event) => {
      if (this.targetOrigin !== '*' && event.origin !== this.targetOrigin) {
        return
      }
      this.onMessage?.(event.data)
    })
  }

  send(data: any) {
    this.targetWindow.postMessage(data, this.targetOrigin)
  }
}
