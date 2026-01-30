import BaseDriver from './BaseDriver'

export default class WebSocketDriver extends BaseDriver {
  ws: WebSocket

  constructor(url: string) {
    super()
    this.ws = new WebSocket(url)

    this.ws.addEventListener('open', () => {
      console.log(`WebSocket connected to ${url}`)
    })

    this.ws.addEventListener('message', (event) => {
      this.onMessage?.(JSON.parse(event.data))
    })

    this.ws.addEventListener('error', (event) => {
      console.error('WebSocket error:', event)
    })

    this.ws.addEventListener('close', () => {
      console.log('WebSocket connection closed')
    })
  }

  send(data: any) {
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }
    this.ws.send(JSON.stringify(data))
  }

  close() {
    this.ws.close()
  }
}
