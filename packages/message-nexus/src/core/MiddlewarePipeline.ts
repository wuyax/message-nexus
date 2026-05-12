import type { Message } from '../drivers/BaseDriver'

export type MiddlewareContext = {
  message: Message
  direction: 'inbound' | 'outbound'
  nexusInstanceId: string
  [key: string]: unknown
}

export type Next = () => Promise<void>

export type Middleware = (ctx: MiddlewareContext, next: Next) => Promise<void>

export class MiddlewarePipeline {
  private middlewares: Middleware[] = []

  use(middleware: Middleware) {
    this.middlewares.push(middleware)
    return () => {
      this.middlewares = this.middlewares.filter((m) => m !== middleware)
    }
  }

  async execute(ctx: MiddlewareContext): Promise<void> {
    let index = -1

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) {
        throw new Error('next() called multiple times')
      }
      index = i
      let fn = this.middlewares[i]
      if (i === this.middlewares.length) {
        return // Reached end of pipeline
      }
      if (!fn) {
        return
      }
      
      // Wrap middleware execution in timeout if we want to enforce it at the pipeline level,
      // but usually the caller handles timeout. We'll let the user/middleware handle timeouts
      // or we can add a built-in timeout logic similar to before.
      await fn(ctx, dispatch.bind(null, i + 1))
    }

    await dispatch(0)
  }
  
  clear() {
    this.middlewares = []
  }

  get isEmpty() {
    return this.middlewares.length === 0
  }
}
