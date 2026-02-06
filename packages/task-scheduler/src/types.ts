/**
 * 任务优先级枚举
 */
export enum TaskPriority {
  HIGH = 0,      // 高优先级：用户交互、相机更新
  NORMAL = 1,    // 普通优先级：模型添加、材质更新
  LOW = 2        // 低优先级：预加载、背景计算
}

/**
 * 任务状态枚举
 */
export enum TaskStatus {
  PENDING = 'pending',       // 等待执行
  RUNNING = 'running',       // 执行中
  PAUSED = 'paused',         // 已暂停
  COMPLETED = 'completed',   // 已完成
  FAILED = 'failed',         // 执行失败
  CANCELLED = 'cancelled'    // 已取消
}

/**
 * 任务类型
 */
export enum TaskType {
  ADD_OBJECT = 'add_object',           // 添加对象
  REMOVE_OBJECT = 'remove_object',     // 移除对象
  UPDATE_MATERIAL = 'update_material', // 更新材质
  UPDATE_CAMERA = 'update_camera',     // 更新相机
  LOAD_MODEL = 'load_model',           // 加载模型
  COMPUTE = 'compute',                 // 计算任务
  CUSTOM = 'custom'                    // 自定义任务
}

/**
 * 任务重试策略枚举
 */
export enum TaskRetryStrategy {
  LINEAR = 'linear',           // 线性退避：每次失败后立即或固定间隔重试
  EXPONENTIAL = 'exponential'  // 指数退避：重试间隔随失败次数呈指数级增长，防止系统雪崩
}

/**
 * 任务配置接口：定义单个任务的行为和约束
 */
export interface TaskConfig {
  id?: string;                    // 可选任务ID，不提供则基于时间戳自动生成
  type: TaskType;                 // 任务类型，决定了使用哪个执行器
  priority?: TaskPriority;        // 优先级，影响调度顺序和时间预算分配
  data?: any;                     // 传递给执行器的自定义数据
  interruptible?: boolean;        // 是否允许调度器发送中止信号（通过 AbortSignal）
  retryCount?: number;            // 失败后允许的最大重试次数
  retryStrategy?: TaskRetryStrategy; // 失败重试的退避策略
  timeout?: number;               // 任务执行的最大时长(ms)，超时将抛出错误
  dependencies?: string[];        // 前置依赖任务ID列表，所有依赖完成前任务处于阻塞状态
  onProgress?: (progress: number) => void;  // 任务内部报告进度时的回调函数
}

/**
 * 任务执行函数定义
 */
export type TaskExecutor = (
  data: any,
  context: TaskContext
) => Promise<any> | any;

/**
 * 任务执行上下文：提供给执行器的运行时 API
 */
export interface TaskContext {
  taskId: string;                 // 当前任务的唯一标识
  signal: AbortSignal;            // 中止信号，应在任务内部通过 signal.aborted 或监听事件来响应
  reportProgress: (progress: number) => void;  // 供任务报告执行进度（0-100）
  shouldYield: () => boolean;     // 协作式调度：返回 true 表示当前帧时间已用完，建议长任务挂起
  deltaTime: number;              // 距离上一帧的时间差(ms)，通常用于动画计算
}

/**
 * 任务内部对象接口：包含运行时状态和控制逻辑
 */
export interface Task {
  id: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  data: any;
  executor: TaskExecutor;
  interruptible: boolean;
  retryCount: number;
  retryStrategy: TaskRetryStrategy;
  timeout: number;
  dependencies: string[];
  
  createdAt: number;              // 任务创建的时间戳 (performance.now)
  startedAt?: number;             // 任务首次进入 RUNNING 状态的时间戳
  completedAt?: number;           // 任务进入终态（完成/失败/取消）的时间戳
  
  result?: any;                   // 执行成功后的返回值
  error?: Error;                  // 执行失败后的错误对象
  
  abortController: AbortController;  // 管理该任务中止逻辑的核心对象
  onProgress?: (progress: number) => void;
  
  executeTime?: number;           // 累计执行时间
  lastExecuteTime?: number;       // 最近一次执行的起始时间戳
}

/**
 * 调度器全局配置参数
 */
export interface SchedulerConfig {
  maxTasksPerFrame?: number;      // 每帧最多启动的新任务数（普通/低优先级）
  frameTimeBudget?: number;       // 每帧分配给任务执行的最大耗时(ms)，超过则等待下一帧
  maxConcurrentTasks?: number;    // 系统允许同时处于 RUNNING 状态的异步任务最大数
  enableMonitoring?: boolean;     // 是否记录性能统计信息（FPS, 平均耗时等）
  queueSizeLimit?: number;        // 任务池最大容量，防止内存溢出
  retentionPeriod?: number;       // 任务完成后在内存中保留状态的时长(ms)，过期将被自动清理
}

/**
 * 调度器统计信息
 */
export interface SchedulerStats {
  totalTasks: number;             // 总任务数
  completedTasks: number;         // 已完成任务数
  failedTasks: number;            // 失败任务数
  pendingTasks: number;           // 等待中任务数
  runningTasks: number;           // 执行中任务数
  
  averageWaitTime: number;        // 平均等待时间(ms)
  averageExecuteTime: number;     // 平均执行时间(ms)
  
  queueSizes: {                   // 各优先级队列大小
    [TaskPriority.HIGH]: number;
    [TaskPriority.NORMAL]: number;
    [TaskPriority.LOW]: number;
  };
  
  frameTime: number;              // 上一帧任务执行时间(ms)
  fps: number;                    // 当前帧率
}

/**
 * 任务执行器注册表类型
 */
export type TaskExecutorRegistry = Map<TaskType, TaskExecutor>;

/**
 * 任务事件类型
 */
export enum TaskEvent {
  TASK_ADDED = 'task_added',
  TASK_STARTED = 'task_started',
  TASK_PROGRESS = 'task_progress',
  TASK_COMPLETED = 'task_completed',
  TASK_FAILED = 'task_failed',
  TASK_CANCELLED = 'task_cancelled',
  QUEUE_OVERFLOW = 'queue_overflow'
}

/**
 * 事件监听器类型
 */
export type EventListener = (data: any) => void;
