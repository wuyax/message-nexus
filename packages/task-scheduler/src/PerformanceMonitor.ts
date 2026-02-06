import { TaskScheduler } from './TaskScheduler';
import { TaskEvent } from './types';

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  // 实时指标
  currentFPS: number;
  currentFrameTime: number;
  currentQueueSize: number;
  currentRunningTasks: number;

  // 累计指标
  totalTasksProcessed: number;
  totalTasksFailed: number;
  successRate: number;

  // 平均指标
  averageWaitTime: number;
  averageExecuteTime: number;
  averageFPS: number;

  // 峰值指标
  peakQueueSize: number;
  peakFrameTime: number;
  lowestFPS: number;

  // 历史数据
  fpsHistory: number[];
  frameTimeHistory: number[];
  queueSizeHistory: number[];
}

/**
 * 性能警告类型
 */
export enum PerformanceWarning {
  LOW_FPS = 'low_fps',
  HIGH_FRAME_TIME = 'high_frame_time',
  QUEUE_BUILDUP = 'queue_buildup',
  HIGH_FAILURE_RATE = 'high_failure_rate'
}

/**
 * 性能监控器
 */
export class PerformanceMonitor {
  private scheduler: TaskScheduler;
  private metrics: PerformanceMetrics;
  
  // 历史数据限制
  private historyLimit: number = 60; // 保留最近60个数据点
  
  // 警告阈值
  private thresholds = {
    lowFPS: 30,
    highFrameTime: 16, // 超过一帧的时间
    queueBuildup: 50,
    failureRate: 0.1 // 10%
  };

  // 警告回调
  private warningCallbacks: Map<PerformanceWarning, Set<(data: any) => void>> = new Map();

  // 监控定时器
  private monitorInterval: number | null = null;

  constructor(scheduler: TaskScheduler) {
    this.scheduler = scheduler;
    
    this.metrics = {
      currentFPS: 0,
      currentFrameTime: 0,
      currentQueueSize: 0,
      currentRunningTasks: 0,
      totalTasksProcessed: 0,
      totalTasksFailed: 0,
      successRate: 100,
      averageWaitTime: 0,
      averageExecuteTime: 0,
      averageFPS: 60,
      peakQueueSize: 0,
      peakFrameTime: 0,
      lowestFPS: 60,
      fpsHistory: [],
      frameTimeHistory: [],
      queueSizeHistory: []
    };

    // 初始化警告回调映射
    Object.values(PerformanceWarning).forEach(warning => {
      this.warningCallbacks.set(warning as PerformanceWarning, new Set());
    });

    this.setupEventListeners();
  }

  /**
   * 设置事件监听
   */
  private setupEventListeners(): void {
    this.scheduler.on(TaskEvent.TASK_COMPLETED, () => {
      this.metrics.totalTasksProcessed++;
      this.updateSuccessRate();
    });

    this.scheduler.on(TaskEvent.TASK_FAILED, () => {
      this.metrics.totalTasksFailed++;
      this.updateSuccessRate();
      this.checkFailureRate();
    });
  }

  /**
   * 开始监控
   */
  public start(interval: number = 1000): void {
    if (this.monitorInterval !== null) {
      return;
    }

    this.monitorInterval = window.setInterval(() => {
      this.updateMetrics();
      this.checkThresholds();
    }, interval);
  }

  /**
   * 停止监控
   */
  public stop(): void {
    if (this.monitorInterval !== null) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  /**
   * 更新指标
   */
  private updateMetrics(): void {
    const stats = this.scheduler.getStats();

    // 更新当前指标
    this.metrics.currentFPS = stats.fps;
    this.metrics.currentFrameTime = stats.frameTime;
    this.metrics.currentQueueSize = 
      stats.queueSizes[0] + stats.queueSizes[1] + stats.queueSizes[2];
    this.metrics.currentRunningTasks = stats.runningTasks;

    // 更新平均指标
    this.metrics.averageWaitTime = stats.averageWaitTime;
    this.metrics.averageExecuteTime = stats.averageExecuteTime;

    // 更新历史数据
    this.updateHistory(this.metrics.fpsHistory, stats.fps);
    this.updateHistory(this.metrics.frameTimeHistory, stats.frameTime);
    this.updateHistory(this.metrics.queueSizeHistory, this.metrics.currentQueueSize);

    // 更新平均 FPS
    this.metrics.averageFPS = this.calculateAverage(this.metrics.fpsHistory);

    // 更新峰值指标
    this.metrics.peakQueueSize = Math.max(this.metrics.peakQueueSize, this.metrics.currentQueueSize);
    this.metrics.peakFrameTime = Math.max(this.metrics.peakFrameTime, stats.frameTime);
    this.metrics.lowestFPS = Math.min(this.metrics.lowestFPS, stats.fps);
  }

  /**
   * 更新历史数据
   */
  private updateHistory(history: number[], value: number): void {
    history.push(value);
    if (history.length > this.historyLimit) {
      history.shift();
    }
  }

  /**
   * 计算平均值
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * 更新成功率
   */
  private updateSuccessRate(): void {
    const total = this.metrics.totalTasksProcessed + this.metrics.totalTasksFailed;
    if (total > 0) {
      this.metrics.successRate = (this.metrics.totalTasksProcessed / total) * 100;
    }
  }

  /**
   * 检查阈值并触发警告
   */
  private checkThresholds(): void {
    // 检查 FPS
    if (this.metrics.currentFPS < this.thresholds.lowFPS) {
      this.triggerWarning(PerformanceWarning.LOW_FPS, {
        currentFPS: this.metrics.currentFPS,
        threshold: this.thresholds.lowFPS
      });
    }

    // 检查帧时间
    if (this.metrics.currentFrameTime > this.thresholds.highFrameTime) {
      this.triggerWarning(PerformanceWarning.HIGH_FRAME_TIME, {
        currentFrameTime: this.metrics.currentFrameTime,
        threshold: this.thresholds.highFrameTime
      });
    }

    // 检查队列堆积
    if (this.metrics.currentQueueSize > this.thresholds.queueBuildup) {
      this.triggerWarning(PerformanceWarning.QUEUE_BUILDUP, {
        currentQueueSize: this.metrics.currentQueueSize,
        threshold: this.thresholds.queueBuildup
      });
    }
  }

  /**
   * 检查失败率
   */
  private checkFailureRate(): void {
    const total = this.metrics.totalTasksProcessed + this.metrics.totalTasksFailed;
    if (total > 10) { // 至少处理10个任务后才检查
      const failureRate = this.metrics.totalTasksFailed / total;
      if (failureRate > this.thresholds.failureRate) {
        this.triggerWarning(PerformanceWarning.HIGH_FAILURE_RATE, {
          failureRate: failureRate * 100,
          threshold: this.thresholds.failureRate * 100
        });
      }
    }
  }

  /**
   * 触发警告
   */
  private triggerWarning(warning: PerformanceWarning, data: any): void {
    const callbacks = this.warningCallbacks.get(warning);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in warning callback for ${warning}:`, error);
        }
      });
    }
  }

  /**
   * 监听性能警告
   */
  public onWarning(warning: PerformanceWarning, callback: (data: any) => void): void {
    this.warningCallbacks.get(warning)?.add(callback);
  }

  /**
   * 移除警告监听
   */
  public offWarning(warning: PerformanceWarning, callback: (data: any) => void): void {
    this.warningCallbacks.get(warning)?.delete(callback);
  }

  /**
   * 设置警告阈值
   */
  public setThreshold(warning: PerformanceWarning, value: number): void {
    switch (warning) {
      case PerformanceWarning.LOW_FPS:
        this.thresholds.lowFPS = value;
        break;
      case PerformanceWarning.HIGH_FRAME_TIME:
        this.thresholds.highFrameTime = value;
        break;
      case PerformanceWarning.QUEUE_BUILDUP:
        this.thresholds.queueBuildup = value;
        break;
      case PerformanceWarning.HIGH_FAILURE_RATE:
        this.thresholds.failureRate = value;
        break;
    }
  }

  /**
   * 获取当前指标
   */
  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * 重置指标
   */
  public reset(): void {
    this.metrics = {
      currentFPS: 0,
      currentFrameTime: 0,
      currentQueueSize: 0,
      currentRunningTasks: 0,
      totalTasksProcessed: 0,
      totalTasksFailed: 0,
      successRate: 100,
      averageWaitTime: 0,
      averageExecuteTime: 0,
      averageFPS: 60,
      peakQueueSize: 0,
      peakFrameTime: 0,
      lowestFPS: 60,
      fpsHistory: [],
      frameTimeHistory: [],
      queueSizeHistory: []
    };
  }

  /**
   * 生成性能报告
   */
  public generateReport(): string {
    const metrics = this.metrics;
    
    return `
=== 任务调度器性能报告 ===

【实时指标】
- 当前 FPS: ${metrics.currentFPS}
- 当前帧时间: ${metrics.currentFrameTime.toFixed(2)}ms
- 当前队列大小: ${metrics.currentQueueSize}
- 正在运行任务: ${metrics.currentRunningTasks}

【累计指标】
- 总处理任务: ${metrics.totalTasksProcessed}
- 总失败任务: ${metrics.totalTasksFailed}
- 成功率: ${metrics.successRate.toFixed(2)}%

【平均指标】
- 平均等待时间: ${metrics.averageWaitTime.toFixed(2)}ms
- 平均执行时间: ${metrics.averageExecuteTime.toFixed(2)}ms
- 平均 FPS: ${metrics.averageFPS.toFixed(2)}

【峰值指标】
- 峰值队列大小: ${metrics.peakQueueSize}
- 峰值帧时间: ${metrics.peakFrameTime.toFixed(2)}ms
- 最低 FPS: ${metrics.lowestFPS}

【建议】
${this.generateRecommendations()}
    `.trim();
  }

  /**
   * 生成优化建议
   */
  private generateRecommendations(): string {
    const recommendations: string[] = [];

    if (this.metrics.averageFPS < 30) {
      recommendations.push('- FPS 过低，建议减少每帧任务数或增加帧时间预算');
    }

    if (this.metrics.peakFrameTime > 20) {
      recommendations.push('- 帧时间峰值过高，建议拆分大型任务或启用任务中断');
    }

    if (this.metrics.peakQueueSize > 100) {
      recommendations.push('- 队列经常堆积，建议增加并发任务数或优化任务执行效率');
    }

    if (this.metrics.successRate < 90) {
      recommendations.push('- 任务失败率较高，建议检查任务执行器逻辑或增加重试次数');
    }

    if (recommendations.length === 0) {
      recommendations.push('- 性能良好，无需优化');
    }

    return recommendations.join('\n');
  }
}

// ========== 使用示例 ==========

/**
 * 性能监控使用示例
 */
export function performanceMonitorExample() {
  const scheduler = new TaskScheduler();
  const monitor = new PerformanceMonitor(scheduler);

  // 监听警告
  monitor.onWarning(PerformanceWarning.LOW_FPS, (data) => {
    console.warn(`警告：FPS 过低 (${data.currentFPS})`);
  });

  monitor.onWarning(PerformanceWarning.QUEUE_BUILDUP, (data) => {
    console.warn(`警告：队列堆积 (${data.currentQueueSize})`);
  });

  // 自定义阈值
  monitor.setThreshold(PerformanceWarning.LOW_FPS, 45);
  monitor.setThreshold(PerformanceWarning.QUEUE_BUILDUP, 30);

  // 开始监控（每秒更新一次）
  monitor.start(1000);

  // 定期输出报告
  setInterval(() => {
    console.log(monitor.generateReport());
  }, 10000);

  // 停止监控
  // monitor.stop();
}
