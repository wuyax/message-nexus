// BaseDriver 结构参考
export default class BaseDriver {
  onMessage: ((data: any) => void) | null
  constructor() {
    this.onMessage = null // 由 Bridge 注入
  }
  send(data: any) {
    throw new Error('Not implemented')
  }
}
