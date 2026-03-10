import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TaskScheduler } from '../TaskScheduler'
import { TaskType, TaskPriority, TaskEvent, TaskRetryStrategy, TaskStatus } from '../types'

describe('TaskScheduler', () => {
  let scheduler: TaskScheduler

  beforeEach(() => {
    // 确保 RAF 环境下时间基准一致
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 16),
    )

    scheduler = new TaskScheduler({
      maxTasksPerFrame: 10,
      frameTimeBudget: 16,
      maxConcurrentTasks: 5,
      retentionPeriod: 1000,
    })
  })

  afterEach(() => {
    scheduler.stop()
    scheduler.clear()
  })

  it('应该能够成功注册执行器并执行基础任务', async () => {
    const mockExecutor = vi.fn().mockResolvedValue('success')
    scheduler.registerExecutor(TaskType.CUSTOM, mockExecutor)

    const taskPromise = new Promise((resolve) => {
      scheduler.on(TaskEvent.TASK_COMPLETED, ({ result }) => resolve(result))
    })

    scheduler.addTask({
      type: TaskType.CUSTOM,
      data: { val: 1 },
    })

    scheduler.start()

    const result = await taskPromise
    expect(result).toBe('success')
    expect(mockExecutor).toHaveBeenCalledWith({ val: 1 }, expect.anything())
  })

  it('应该遵循优先级顺序执行任务', async () => {
    const executionOrder: string[] = []
    scheduler.registerExecutor(TaskType.CUSTOM, async (data) => {
      executionOrder.push(data.name)
      return data.name
    })

    // 限制并发为1，确保顺序可观察
    scheduler = new TaskScheduler({ maxConcurrentTasks: 1 })
    scheduler.registerExecutor(TaskType.CUSTOM, async (data) => {
      executionOrder.push(data.name)
    })

    scheduler.addTask({ type: TaskType.CUSTOM, priority: TaskPriority.LOW, data: { name: 'LOW' } })
    scheduler.addTask({
      type: TaskType.CUSTOM,
      priority: TaskPriority.HIGH,
      data: { name: 'HIGH' },
    })
    scheduler.addTask({
      type: TaskType.CUSTOM,
      priority: TaskPriority.NORMAL,
      data: { name: 'NORMAL' },
    })

    const completePromise = new Promise((resolve) => {
      let count = 0
      scheduler.on(TaskEvent.TASK_COMPLETED, () => {
        count++
        if (count === 3) resolve(true)
      })
    })

    scheduler.start()
    await completePromise

    expect(executionOrder).toEqual(['HIGH', 'NORMAL', 'LOW'])
  })

  it('应该支持优先级继承 (Priority Inheritance)', async () => {
    const executionOrder: string[] = []
    // 串行执行以验证逻辑顺序
    const lowConcurrencyScheduler = new TaskScheduler({ maxConcurrentTasks: 1 })
    lowConcurrencyScheduler.registerExecutor(TaskType.CUSTOM, async (data) => {
      executionOrder.push(data.name)
    })

    // A (LOW) 无依赖
    const taskA = lowConcurrencyScheduler.addTask({
      id: 'A',
      type: TaskType.CUSTOM,
      priority: TaskPriority.LOW,
      data: { name: 'A' },
    })

    // B (HIGH) 依赖 A -> A 应该被提升为 HIGH
    lowConcurrencyScheduler.addTask({
      id: 'B',
      type: TaskType.CUSTOM,
      priority: TaskPriority.HIGH,
      dependencies: [taskA],
      data: { name: 'B' },
    })

    // C (NORMAL) 无依赖
    lowConcurrencyScheduler.addTask({
      id: 'C',
      type: TaskType.CUSTOM,
      priority: TaskPriority.NORMAL,
      data: { name: 'C' },
    })

    const completePromise = new Promise((resolve) => {
      let count = 0
      lowConcurrencyScheduler.on(TaskEvent.TASK_COMPLETED, () => {
        count++
        if (count === 3) resolve(true)
      })
    })

    lowConcurrencyScheduler.start()
    await completePromise

    // A 提升为 HIGH 后，顺序应为 A -> B -> C
    expect(executionOrder).toEqual(['A', 'B', 'C'])
  })

  it('应该支持任务依赖管理 (DAG)', async () => {
    const results: string[] = []
    scheduler.registerExecutor(TaskType.CUSTOM, async (data) => {
      results.push(data.name)
      return data.name
    })

    const id1 = scheduler.addTask({ type: TaskType.CUSTOM, id: '1', data: { name: 'task1' } })
    const id2 = scheduler.addTask({
      type: TaskType.CUSTOM,
      id: '2',
      data: { name: 'task2' },
      dependencies: [id1],
    })
    scheduler.addTask({
      type: TaskType.CUSTOM,
      id: '3',
      data: { name: 'task3' },
      dependencies: [id2],
    })

    const completePromise = new Promise((resolve) => {
      let count = 0
      scheduler.on(TaskEvent.TASK_COMPLETED, () => {
        count++
        if (count === 3) resolve(true)
      })
    })

    scheduler.start()
    await completePromise

    expect(results).toEqual(['task1', 'task2', 'task3'])
  })

  it('应该支持指数退避重试 (Exponential Backoff)', async () => {
    let attempts = 0
    const startTime = Date.now()
    const attemptTimes: number[] = []

    scheduler.registerExecutor(TaskType.CUSTOM, async () => {
      attempts++
      attemptTimes.push(Date.now())
      if (attempts < 3) throw new Error('fail')
      return 'ok'
    })

    const completePromise = new Promise((resolve) => {
      scheduler.on(TaskEvent.TASK_COMPLETED, resolve)
    })

    scheduler.addTask({
      type: TaskType.CUSTOM,
      retryCount: 2,
      retryStrategy: TaskRetryStrategy.EXPONENTIAL,
    })

    scheduler.start()
    await completePromise

    expect(attempts).toBe(3)
    const delays = [attemptTimes[1] - attemptTimes[0], attemptTimes[2] - attemptTimes[1]]

    // 指数退避: 第一次重试(delay1), 第二次重试(delay2 > delay1)
    // 允许一定的计时误差
    expect(delays[1]).toBeGreaterThan(delays[0])
  })

  it('应该支持任务超时', async () => {
    scheduler.registerExecutor(TaskType.CUSTOM, async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
      return 'ok'
    })

    const failPromise = new Promise((resolve) => {
      scheduler.on(TaskEvent.TASK_FAILED, ({ error }) => resolve(error))
    })

    scheduler.addTask({
      type: TaskType.CUSTOM,
      timeout: 100, // 设置一个短超时
    })

    scheduler.start()
    const error = (await failPromise) as Error
    expect(error.message).toBe('Task timeout')
  })

  it('应该能够取消正在执行的任务', async () => {
    let wasCancelled = false
    scheduler.registerExecutor(TaskType.CUSTOM, async (data, context) => {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, 1000)
        context.signal.addEventListener('abort', () => {
          clearTimeout(timeout)
          wasCancelled = true
          reject(new Error('Cancelled'))
        })
      })
    })

    const taskId = scheduler.addTask({ type: TaskType.CUSTOM, interruptible: true })

    scheduler.start()

    // 等待任务开始
    await new Promise((resolve) => scheduler.on(TaskEvent.TASK_STARTED, resolve))

    scheduler.cancelTask(taskId)

    expect(wasCancelled).toBe(true)
    expect(scheduler.getTaskStatus(taskId)).toBe(TaskStatus.CANCELLED)
  })

  it('应该能够自动清理过期任务', async () => {
    scheduler.registerExecutor(TaskType.CUSTOM, () => 'done')

    const taskId = scheduler.addTask({ type: TaskType.CUSTOM })

    const completePromise = new Promise((resolve) => {
      scheduler.on(TaskEvent.TASK_COMPLETED, resolve)
    })

    scheduler.start()
    await completePromise

    expect(scheduler.getTaskStatus(taskId)).toBe(TaskStatus.COMPLETED)

    // 等待超过 retentionPeriod (1000ms) + cleanup 间隔 (10000ms 但我们在代码里能看到它是 setInterval)
    // 为了加速测试，我们可能需要 mock 时间或者稍微等待
    // 这里我们直接等待
    await new Promise((resolve) => setTimeout(resolve, 12000))

    expect(scheduler.getTaskStatus(taskId)).toBeNull()
  }, 15000)

  it('应该在队列已满时拒绝添加新任务', () => {
    // 创建一个小容量的调度器
    const smallScheduler = new TaskScheduler({ queueSizeLimit: 2 })
    smallScheduler.registerExecutor(TaskType.CUSTOM, () => {})

    smallScheduler.addTask({ type: TaskType.CUSTOM, id: '1' })
    smallScheduler.addTask({ type: TaskType.CUSTOM, id: '2' })

    expect(() => {
      smallScheduler.addTask({ type: TaskType.CUSTOM, id: '3' })
    }).toThrow(/Queue size limit reached/)
  })

  it('应该防止添加重复的任务 ID', () => {
    scheduler.registerExecutor(TaskType.CUSTOM, () => {})
    scheduler.addTask({ type: TaskType.CUSTOM, id: 'duplicate-id' })

    expect(() => {
      scheduler.addTask({ type: TaskType.CUSTOM, id: 'duplicate-id' })
    }).toThrow(/already exists/)
  })

  it('应该在添加未注册执行器的任务时抛出错误', () => {
    expect(() => {
      scheduler.addTask({ type: TaskType.CUSTOM }) // 尚未注册 CUSTOM 执行器
    }).toThrow(/No executor registered/)
  })

  it('应该正确报告任务进度', async () => {
    const progressValues: number[] = []
    scheduler.registerExecutor(TaskType.CUSTOM, (data, context) => {
      context.reportProgress(10)
      context.reportProgress(50)
      context.reportProgress(100)
      return 'done'
    })

    const taskId = scheduler.addTask({
      type: TaskType.CUSTOM,
      onProgress: (p) => progressValues.push(p),
    })

    // 同时验证事件监听
    const eventProgress: number[] = []
    scheduler.on(TaskEvent.TASK_PROGRESS, ({ taskId: id, progress }) => {
      if (id === taskId) eventProgress.push(progress)
    })

    scheduler.start()

    await new Promise((resolve) => scheduler.on(TaskEvent.TASK_COMPLETED, resolve))

    expect(progressValues).toEqual([10, 50, 100])
    expect(eventProgress).toEqual([10, 50, 100])
  })

  it('应该能够停止和清除调度器', async () => {
    scheduler.registerExecutor(TaskType.CUSTOM, () => {})
    scheduler.addTask({ type: TaskType.CUSTOM })

    expect(scheduler.getStats().pendingTasks).toBe(1)

    // Stop 测试
    scheduler.stop()
    // 再次添加任务
    scheduler.addTask({ type: TaskType.CUSTOM })
    // 由于停止了，任务不应该被执行（虽然被添加了）
    // 但我们需要一种方式验证它没在跑。
    // 在本实现中，stop 只是停止了 raf 循环。如果之前有 tick 已经 schedule 了，可能还会跑一次。
    // 但 clear 是确定性的。

    scheduler.clear()
    const stats = scheduler.getStats()
    expect(stats.totalTasks).toBe(0)
    expect(stats.pendingTasks).toBe(0)
    expect(stats.runningTasks).toBe(0)
    expect(scheduler.getTaskStatus('any-id')).toBeNull()
  })

  it('应该支持协作式调度 (shouldYield)', async () => {
    // 模拟 perfomance.now
    const nowSpy = vi.spyOn(performance, 'now')
    let currentTime = 1000
    nowSpy.mockImplementation(() => currentTime)

    // 预算只有 6ms
    scheduler = new TaskScheduler({ frameTimeBudget: 6, maxConcurrentTasks: 1 })

    let yielded = false
    scheduler.registerExecutor(TaskType.CUSTOM, async (data, context) => {
      // 模拟任务开始后时间过了 10ms
      currentTime += 10
      if (context.shouldYield()) {
        yielded = true
      }
      return 'done'
    })

    scheduler.addTask({ type: TaskType.CUSTOM })
    scheduler.start()

    await new Promise((resolve) => scheduler.on(TaskEvent.TASK_COMPLETED, resolve))

    expect(yielded).toBe(true)
    nowSpy.mockRestore()
  })

  it('应该支持多层级依赖的优先级提升 (Deep Priority Inheritance)', async () => {
    // A(Low) <- B(Low) <- C(High)
    // 期望: A 和 B 都被提升为 High
    const executionOrder: string[] = []

    // 限制并发为 1 保证顺序
    const serialScheduler = new TaskScheduler({ maxConcurrentTasks: 1 })
    serialScheduler.registerExecutor(TaskType.CUSTOM, async (data) => {
      executionOrder.push(data.name)
    })

    // 1. 添加 A (Low)
    const taskA = serialScheduler.addTask({
      id: 'A',
      type: TaskType.CUSTOM,
      priority: TaskPriority.LOW,
      data: { name: 'A' },
    })

    // 2. 添加 B (Low, 依赖 A)
    const taskB = serialScheduler.addTask({
      id: 'B',
      type: TaskType.CUSTOM,
      priority: TaskPriority.LOW,
      dependencies: [taskA],
      data: { name: 'B' },
    })

    // 3. 添加 C (High, 依赖 B)
    // 这应该触发: C -> B (Low->High) -> A (Low->High)
    serialScheduler.addTask({
      id: 'C',
      type: TaskType.CUSTOM,
      priority: TaskPriority.HIGH,
      dependencies: [taskB],
      data: { name: 'C' },
    })

    // 添加一个干扰项 D (Normal)
    // 如果 A 没被提升，D(Normal) 会在 A(Low) 之前运行。
    // 如果 A 被提升为 High，A 应该在 D 之前运行。
    serialScheduler.addTask({
      id: 'D',
      type: TaskType.CUSTOM,
      priority: TaskPriority.NORMAL,
      data: { name: 'D' },
    })

    const completePromise = new Promise((resolve) => {
      let count = 0
      serialScheduler.on(TaskEvent.TASK_COMPLETED, () => {
        count++
        if (count === 4) resolve(true)
      })
    })

    serialScheduler.start()
    await completePromise

    // 期望顺序:
    // A (High, via inheritance)
    // B (High, via inheritance)
    // C (High)
    // D (Normal)
    expect(executionOrder).toEqual(['A', 'B', 'C', 'D'])
  })
})
