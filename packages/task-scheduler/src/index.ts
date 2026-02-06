/**
 * Three.js 任务调度器
 * 
 * 一个功能完善的任务调度系统，专为 Three.js 3D 场景设计
 * 提供性能优化、任务管理和调试功能
 */

// 核心类
export { TaskScheduler } from './TaskScheduler';
export { PerformanceMonitor } from './PerformanceMonitor';
export { 
  MessageHandler,
  WebSocketMessageHandler,
  PostMessageHandler 
} from './MessageHandler';

// 类型定义
export {
  // 枚举
  TaskPriority,
  TaskStatus,
  TaskType,
  TaskEvent,
  
  // 接口
  TaskConfig,
  TaskExecutor,
  TaskContext,
  Task,
  SchedulerConfig,
  SchedulerStats,
  TaskExecutorRegistry,
  EventListener,
} from './types';
export type { PerformanceMetrics } from './PerformanceMonitor';

// 示例（可选导出，用于参考）
// export { ThreeJsTaskSchedulerExample } from './example';
