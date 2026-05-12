import { NexusError, NexusErrorCode } from '../errors'

export interface Task<R = unknown> {
  resolve: (value: R) => void
  reject: (reason?: unknown) => void
  timer: ReturnType<typeof setTimeout>
  timestamp: number
}

export interface RpcSchedulerOptions {
  defaultTimeout?: number
}

export class RpcScheduler {
  private pendingTasks: Map<string, Task> = new Map()
  private defaultTimeout: number

  constructor(options: RpcSchedulerOptions = {}) {
    this.defaultTimeout = options.defaultTimeout ?? 10000
  }

  createTask<R = unknown>(
    id: string,
    method: string,
    timeout: number = this.defaultTimeout,
    onTimeout?: (id: string) => void
  ): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingTasks.delete(id)
        if (onTimeout) {
          onTimeout(id)
        }
        reject(new NexusError(`Message timeout: ${method} (${id})`, NexusErrorCode.Timeout))
      }, timeout)

      this.pendingTasks.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
        timestamp: Date.now(),
      })
    })
  }

  hasTask(id: string): boolean {
    return this.pendingTasks.has(id)
  }

  resolveTask(id: string, result: unknown): { latency: number } | null {
    const task = this.pendingTasks.get(id)
    if (task) {
      clearTimeout(task.timer)
      this.pendingTasks.delete(id)
      const latency = Date.now() - task.timestamp
      task.resolve(result)
      return { latency }
    }
    return null
  }

  rejectTask(id: string, error: unknown): { latency: number } | null {
    const task = this.pendingTasks.get(id)
    if (task) {
      clearTimeout(task.timer)
      this.pendingTasks.delete(id)
      const latency = Date.now() - task.timestamp
      task.reject(error)
      return { latency }
    }
    return null
  }

  get size(): number {
    return this.pendingTasks.size
  }

  clearTasks(): void {
    for (const [id, task] of this.pendingTasks.entries()) {
      clearTimeout(task.timer)
    }
    this.pendingTasks.clear()
  }
}
