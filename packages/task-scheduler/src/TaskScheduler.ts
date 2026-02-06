import {
  Task,
  TaskConfig,
  TaskPriority,
  TaskStatus,
  TaskType,
  TaskExecutor,
  TaskContext,
  SchedulerConfig,
  SchedulerStats,
  TaskExecutorRegistry,
  TaskEvent,
  EventListener,
  TaskRetryStrategy
} from './types';

/**
 * TaskScheduler (任务调度器)
 * 
 * 核心设计目标：在保证 UI 60FPS 流畅度的前提下，高效调度复杂的异步任务流。
 * 关键特性：
 * 1. DAG 依赖管理：基于有向无环图的任务触发，消除轮询。
 * 2. 优先级继承：解决优先级反转问题，确保高优先级任务不被低优先级依赖阻塞。
 * 3. 环境感知调度：自适应浏览器 RAF 与 Node.js/后台环境。
 * 4. 指数退避：智能重试策略，保护后端资源。
 * 5. 协作式调度：支持长任务主动让出主线程。
 */
export class TaskScheduler {
  // 就绪任务队列：按优先级分桶存储可立即执行的任务
  private queues: Map<TaskPriority, Task[]> = new Map([
    [TaskPriority.HIGH, []],
    [TaskPriority.NORMAL, []],
    [TaskPriority.LOW, []]
  ]);

  // 全局任务映射：用于通过 ID 快速查找任务及其状态
  private taskMap: Map<string, Task> = new Map();

  // 阻塞任务池：存储正在等待依赖项完成的任务
  private blockedTasks: Map<string, Task> = new Map();

  // 依赖图（邻接表）：TaskId -> [依赖于它的任务ID集合]
  // 用于任务完成时快速通知下游任务
  private dependencyGraph: Map<string, Set<string>> = new Map();

  // 活跃任务集合：记录当前正在 RUNNING 状态的任务 ID
  private runningTasks: Set<string> = new Set();

  // 执行器注册表：TaskType 到具体实现函数的映射
  private executors: TaskExecutorRegistry = new Map();

  // 运行时配置
  private config: Required<SchedulerConfig>;

  // 事件系统：管理任务生命周期事件的监听器
  private eventListeners: Map<TaskEvent, Set<EventListener>> = new Map();

  // 统计快照：实时记录调度器的各项性能指标
  private stats: SchedulerStats = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    pendingTasks: 0,
    runningTasks: 0,
    averageWaitTime: 0,
    averageExecuteTime: 0,
    queueSizes: {
      [TaskPriority.HIGH]: 0,
      [TaskPriority.NORMAL]: 0,
      [TaskPriority.LOW]: 0
    },
    frameTime: 0,
    fps: 60
  };

  // 调度循环控制状态
  private isRunning: boolean = false;
  private tickScheduled: boolean = false;

  // FPS 计算辅助变量
  private frameCount: number = 0;
  private fpsUpdateTime: number = 0;

  // 内部递增计数器，用于生成唯一 ID
  private taskIdCounter: number = 0;

  // 内存自动清理定时器引用
  private cleanupTimer: any = null;

  constructor(config: SchedulerConfig = {}) {
    this.config = {
      maxTasksPerFrame: config.maxTasksPerFrame ?? 5,
      frameTimeBudget: config.frameTimeBudget ?? 6, // 默认分配 6ms 给任务，预留空间给渲染
      maxConcurrentTasks: config.maxConcurrentTasks ?? 3,
      enableMonitoring: config.enableMonitoring ?? true,
      queueSizeLimit: config.queueSizeLimit ?? 1000,
      retentionPeriod: config.retentionPeriod ?? 60000 
    };

    // 初始化事件总线
    Object.values(TaskEvent).forEach(event => {
      this.eventListeners.set(event as TaskEvent, new Set());
    });
  }

  /**
   * 注册任务执行器：将任务类型与具体的异步逻辑关联
   */
  public registerExecutor(type: TaskType, executor: TaskExecutor): void {
    this.executors.set(type, executor);
  }

  /**
   * 批量注册执行器
   */
  public registerExecutors(executors: Map<TaskType, TaskExecutor>): void {
    executors.forEach((executor, type) => this.registerExecutor(type, executor));
  }

  /**
   * 添加新任务到调度器
   * @throws 如果任务池溢出或 ID 重复或未注册执行器
   */
  public addTask(config: TaskConfig): string {
    if (this.taskMap.size >= this.config.queueSizeLimit) {
      this.emit(TaskEvent.QUEUE_OVERFLOW, { config });
      throw new Error(`Queue size limit reached: ${this.config.queueSizeLimit}`);
    }

    const taskId = config.id || this.generateTaskId();
    if (this.taskMap.has(taskId)) {
      throw new Error(`Task with id ${taskId} already exists`);
    }

    const executor = this.executors.get(config.type);
    if (!executor) {
      throw new Error(`No executor registered for task type: ${config.type}`);
    }

    // 初始化任务对象模型
    const task: Task = {
      id: taskId,
      type: config.type,
      priority: config.priority ?? TaskPriority.NORMAL,
      status: TaskStatus.PENDING,
      data: config.data,
      executor,
      interruptible: config.interruptible ?? false,
      retryCount: config.retryCount ?? 0,
      retryStrategy: config.retryStrategy ?? TaskRetryStrategy.LINEAR,
      timeout: config.timeout ?? 0,
      dependencies: config.dependencies ?? [],
      createdAt: performance.now(),
      abortController: new AbortController(),
      onProgress: config.onProgress
    };

    this.taskMap.set(taskId, task);
    this.stats.totalTasks++;
    this.stats.pendingTasks++;

    // 依赖处理与优先级继承逻辑
    if (task.dependencies.length > 0 && !this.areDependenciesMet(task)) {
      task.dependencies.forEach(depId => {
        // 构建反向依赖图
        if (!this.dependencyGraph.has(depId)) {
          this.dependencyGraph.set(depId, new Set());
        }
        this.dependencyGraph.get(depId)!.add(taskId);

        // 核心优化：优先级继承
        // 如果 A 依赖 B，且 A 优先级 > B，则临时提升 B 的优先级，防止高优任务被阻塞
        const depTask = this.taskMap.get(depId);
        if (depTask && depTask.status !== TaskStatus.COMPLETED && depTask.status !== TaskStatus.FAILED) {
           this.promotePriority(depTask, task.priority);
        }
      });
      this.blockedTasks.set(taskId, task);
    } else {
      this.enqueueTask(task);
    }

    this.updateQueueSizes();
    this.emit(TaskEvent.TASK_ADDED, { taskId, task });

    // 唤醒调度循环
    if (this.isRunning && !this.tickScheduled) {
      this.scheduleTick();
    }

    return taskId;
  }

  /**
   * 递归提升任务及其所有依赖链的优先级
   * 采用递归是为了确保整个“依赖树”都被加速
   */
  private promotePriority(task: Task, targetPriority: TaskPriority): void {
    if (task.priority <= targetPriority) return; // 数值越小优先级越高

    // 如果任务已经在就绪队列，需要挪动位置
    if (task.status === TaskStatus.PENDING && !this.blockedTasks.has(task.id)) {
      const oldQueue = this.queues.get(task.priority)!;
      const idx = oldQueue.indexOf(task);
      if (idx !== -1) oldQueue.splice(idx, 1);
      
      task.priority = targetPriority;
      this.queues.get(task.priority)!.push(task);
    } else {
      task.priority = targetPriority;
    }

    // 深度优先递归提升
    task.dependencies.forEach(depId => {
       const depTask = this.taskMap.get(depId);
       if (depTask && depTask.status !== TaskStatus.COMPLETED) {
         this.promotePriority(depTask, targetPriority);
       }
    });
  }

  /**
   * 取消指定的任务
   * 正在运行的任务将收到 AbortSignal
   */
  public cancelTask(taskId: string): boolean {
    const task = this.taskMap.get(taskId);
    if (!task) return false;

    if (task.status === TaskStatus.RUNNING) {
      task.abortController.abort();
    }

    this.removeFromQueue(task);
    this.blockedTasks.delete(taskId);
    task.status = TaskStatus.CANCELLED;
    this.runningTasks.delete(taskId);

    this.stats.pendingTasks = Math.max(0, this.stats.pendingTasks - 1);
    this.updateQueueSizes();
    this.emit(TaskEvent.TASK_CANCELLED, { taskId, task });

    return true;
  }

  public getTaskStatus(taskId: string): TaskStatus | null {
    return this.taskMap.get(taskId)?.status ?? null;
  }

  public getTaskResult(taskId: string): any {
    return this.taskMap.get(taskId)?.result;
  }

  public getStats(): SchedulerStats {
    return { ...this.stats };
  }

  /**
   * 启动调度器工作线程/循环
   */
  public start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.fpsUpdateTime = performance.now();
    
    // 启动低频内存清理任务
    this.cleanupTimer = setInterval(() => this.cleanupTasks(), 10000);
    this.scheduleTick();
  }

  /**
   * 暂停调度循环，不再启动新任务
   */
  public stop(): void {
    this.isRunning = false;
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 重置调度器，取消所有任务并清空队列
   */
  public clear(): void {
    this.runningTasks.forEach(taskId => {
      this.taskMap.get(taskId)?.abortController.abort();
    });

    this.queues.forEach(queue => queue.length = 0);
    this.taskMap.clear();
    this.blockedTasks.clear();
    this.dependencyGraph.clear();
    this.runningTasks.clear();

    this.stats.pendingTasks = 0;
    this.stats.runningTasks = 0;
    this.stats.totalTasks = 0;
    this.updateQueueSizes();
  }

  public on(event: TaskEvent, listener: EventListener): void {
    this.eventListeners.get(event)?.add(listener);
  }

  public off(event: TaskEvent, listener: EventListener): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  /**
   * 环境感知调度核心：
   * 1. 优先使用 requestAnimationFrame (RAF) 以匹配显示刷新率。
   * 2. 在非浏览器或后台环境回退至 setTimeout 保持运行。
   */
  private scheduleTick(): void {
    if (!this.isRunning || this.tickScheduled) return;

    this.tickScheduled = true;

    const onTick = (timestamp: number) => {
      this.tickScheduled = false;
      if (!this.isRunning) return;
      
      this.processTasks(timestamp);
      this.updateFPS(timestamp);

      // 如果还有活要干，继续调度下一轮
      if (this.stats.pendingTasks > 0 || this.runningTasks.size > 0) {
        this.scheduleTick();
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(onTick);
    } else {
      setTimeout(() => onTick(performance.now()), 16); // 模拟 60fps 的心跳
    }
  }

  /**
   * 单帧任务处理逻辑：
   * 严格遵循优先级顺序和时间预算，防止单帧耗时过长导致掉帧。
   */
  private async processTasks(frameStartTime: number): Promise<void> {
    let tasksExecuted = 0;
    const timeBudget = this.config.frameTimeBudget;

    for (const priority of [TaskPriority.HIGH, TaskPriority.NORMAL, TaskPriority.LOW]) {
      const queue = this.queues.get(priority)!;

      while (queue.length > 0 && this.runningTasks.size < this.config.maxConcurrentTasks) {
        // 调度约束检查
        if (priority !== TaskPriority.HIGH) {
            // 高优先级任务具有“穿透力”，普通任务受预算限制
            if (performance.now() - frameStartTime >= timeBudget) break;
            if (tasksExecuted >= this.config.maxTasksPerFrame) break;
        }

        const task = queue.shift();
        if (task) {
          this.executeTask(task, frameStartTime);
          tasksExecuted++;
        }
      }
    }
    this.stats.frameTime = performance.now() - frameStartTime;
  }

  /**
   * 任务执行封装：
   * 包含超时控制、异常处理和重试退避逻辑。
   */
  private async executeTask(task: Task, frameStartTime: number): Promise<void> {
    task.status = TaskStatus.RUNNING;
    task.startedAt = performance.now();
    task.lastExecuteTime = task.startedAt;
    
    this.runningTasks.add(task.id);
    this.stats.pendingTasks--;
    this.stats.runningTasks++;

    this.emit(TaskEvent.TASK_STARTED, { taskId: task.id, task });

    // 注入运行时上下文
    const context: TaskContext = {
      taskId: task.id,
      signal: task.abortController.signal,
      reportProgress: (progress: number) => {
        task.onProgress?.(progress);
        this.emit(TaskEvent.TASK_PROGRESS, { taskId: task.id, progress });
      },
      shouldYield: () => (performance.now() - frameStartTime) > this.config.frameTimeBudget,
      deltaTime: 0 // 可根据需求计算
    };

    try {
      const timeoutPromise = task.timeout > 0
        ? new Promise((_, reject) => setTimeout(() => reject(new Error('Task timeout')), task.timeout))
        : null;

      const executePromise = Promise.resolve(task.executor(task.data, context));
      
      const result = timeoutPromise
        ? await Promise.race([executePromise, timeoutPromise])
        : await executePromise;

      this.completeTask(task, result);

    } catch (error: any) {
      if (task.abortController.signal.aborted) {
        task.status = TaskStatus.CANCELLED;
        this.emit(TaskEvent.TASK_CANCELLED, { taskId: task.id, task });
      } else {
        this.handleTaskError(task, error);
      }
    } finally {
      this.runningTasks.delete(task.id);
      this.stats.runningTasks--;
      this.updateQueueSizes();
    }
  }

  private completeTask(task: Task, result: any): void {
    task.result = result;
    task.status = TaskStatus.COMPLETED;
    task.completedAt = performance.now();

    this.stats.completedTasks++;
    this.updateAverageExecuteTime(task);
    this.updateAverageWaitTime(task);

    this.emit(TaskEvent.TASK_COMPLETED, { taskId: task.id, task, result });

    // 依赖链触发：基于图查找受影响的下游任务
    this.processDependents(task.id);
  }

  /**
   * 错误处理与指数退避：
   * 自动决定是彻底失败还是延迟重新加入队列。
   */
  private handleTaskError(task: Task, error: Error): void {
    task.error = error;

    if (task.retryCount > 0) {
      task.retryCount--;
      task.status = TaskStatus.PENDING;
      task.abortController = new AbortController(); 
      
      let delay = 0;
      if (task.retryStrategy === TaskRetryStrategy.EXPONENTIAL) {
         // 计算指数级延迟，基础值 100ms
         // 第一次重试(count=2) -> 200ms, 第二次(count=1) -> 400ms...
         delay = 100 * Math.pow(2, 3 - task.retryCount); 
      }

      setTimeout(() => {
          this.enqueueTask(task);
          this.stats.pendingTasks++;
          if (this.isRunning) this.scheduleTick();
      }, delay);
      
    } else {
      task.status = TaskStatus.FAILED;
      task.completedAt = performance.now();
      this.stats.failedTasks++;
      this.emit(TaskEvent.TASK_FAILED, { taskId: task.id, task, error });
    }
  }

  /**
   * 检查下游任务的依赖开启状态，实现 O(1) 的任务激活过程
   */
  private processDependents(completedTaskId: string): void {
    const dependents = this.dependencyGraph.get(completedTaskId);
    if (!dependents) return;

    dependents.forEach(depId => {
      const depTask = this.blockedTasks.get(depId);
      if (depTask && this.areDependenciesMet(depTask)) {
        this.blockedTasks.delete(depId);
        this.enqueueTask(depTask);
        if (!this.tickScheduled) this.scheduleTick();
      }
    });

    this.dependencyGraph.delete(completedTaskId);
  }

  private areDependenciesMet(task: Task): boolean {
    return task.dependencies.every(depId => {
      const dep = this.taskMap.get(depId);
      return dep?.status === TaskStatus.COMPLETED;
    });
  }

  private enqueueTask(task: Task): void {
    this.queues.get(task.priority)!.push(task);
  }

  private removeFromQueue(task: Task): void {
    const queue = this.queues.get(task.priority)!;
    const index = queue.findIndex(t => t.id === task.id);
    if (index !== -1) queue.splice(index, 1);
  }

  /**
   * 自动垃圾回收：
   * 清理过期的任务状态，释放内存，保证调度器可长时间稳定运行。
   */
  private cleanupTasks(): void {
    const now = performance.now();
    const retention = this.config.retentionPeriod;

    for (const [taskId, task] of this.taskMap.entries()) {
      if (
        (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED || task.status === TaskStatus.CANCELLED) &&
        task.completedAt && (now - task.completedAt > retention)
      ) {
        this.taskMap.delete(taskId);
        this.dependencyGraph.delete(taskId); 
      }
    }
  }

  private updateQueueSizes(): void {
    this.stats.queueSizes[TaskPriority.HIGH] = this.queues.get(TaskPriority.HIGH)!.length;
    this.stats.queueSizes[TaskPriority.NORMAL] = this.queues.get(TaskPriority.NORMAL)!.length;
    this.stats.queueSizes[TaskPriority.LOW] = this.queues.get(TaskPriority.LOW)!.length;
  }

  private updateAverageWaitTime(task: Task): void {
    if (!task.startedAt) return;
    const waitTime = task.startedAt - task.createdAt;
    const total = this.stats.completedTasks + this.stats.failedTasks;
    this.stats.averageWaitTime = (this.stats.averageWaitTime * (total - 1) + waitTime) / total;
  }

  private updateAverageExecuteTime(task: Task): void {
    if (!task.startedAt || !task.completedAt) return;
    const executeTime = task.completedAt - task.startedAt;
    const n = this.stats.completedTasks;
    this.stats.averageExecuteTime = (this.stats.averageExecuteTime * (n - 1) + executeTime) / n;
  }

  private updateFPS(timestamp: number): void {
    this.frameCount++;
    const elapsed = timestamp - this.fpsUpdateTime;
    if (elapsed >= 1000) {
      this.stats.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.fpsUpdateTime = timestamp;
    }
  }

  private generateTaskId(): string {
    return `task_${++this.taskIdCounter}_${Date.now()}`;
  }

  private emit(event: TaskEvent, data: any): void {
    this.eventListeners.get(event)?.forEach(listener => {
      try { listener(data); } catch (e) { console.error(e); }
    });
  }
}
