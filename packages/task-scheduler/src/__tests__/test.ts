/**
 * 任务调度器测试示例
 * 演示各种使用场景和功能
 */

import { TaskScheduler } from './TaskScheduler';
import { PerformanceMonitor, PerformanceWarning } from './PerformanceMonitor';
import { MessageHandler, MessageType } from './MessageHandler';
import { 
  TaskType, 
  TaskPriority, 
  TaskEvent,
  TaskContext 
} from './types';

// ============ 测试1: 基础任务调度 ============
function testBasicScheduling() {
  console.log('=== 测试1: 基础任务调度 ===');
  
  const scheduler = new TaskScheduler({
    maxTasksPerFrame: 3,
    frameTimeBudget: 10
  });

  // 注册简单的任务执行器
  scheduler.registerExecutor(TaskType.CUSTOM, async (data) => {
    console.log(`执行任务: ${data.name}`);
    return { success: true, name: data.name };
  });

  // 监听事件
  scheduler.on(TaskEvent.TASK_COMPLETED, ({ taskId, result }) => {
    console.log(`✓ 任务完成: ${taskId}`, result);
  });

  // 添加任务
  for (let i = 0; i < 5; i++) {
    scheduler.addTask({
      type: TaskType.CUSTOM,
      data: { name: `Task-${i}` }
    });
  }

  scheduler.start();

  // 5秒后停止
  setTimeout(() => {
    scheduler.stop();
    console.log('统计信息:', scheduler.getStats());
  }, 5000);
}

// ============ 测试2: 优先级调度 ============
function testPriorityScheduling() {
  console.log('\n=== 测试2: 优先级调度 ===');
  
  const scheduler = new TaskScheduler();

  let executionOrder: string[] = [];

  scheduler.registerExecutor(TaskType.CUSTOM, async (data) => {
    executionOrder.push(data.name);
    console.log(`执行: ${data.name} (优先级: ${data.priority})`);
    return { name: data.name };
  });

  // 添加不同优先级的任务
  scheduler.addTask({
    type: TaskType.CUSTOM,
    priority: TaskPriority.LOW,
    data: { name: 'Low-1', priority: 'LOW' }
  });

  scheduler.addTask({
    type: TaskType.CUSTOM,
    priority: TaskPriority.NORMAL,
    data: { name: 'Normal-1', priority: 'NORMAL' }
  });

  scheduler.addTask({
    type: TaskType.CUSTOM,
    priority: TaskPriority.HIGH,
    data: { name: 'High-1', priority: 'HIGH' }
  });

  scheduler.addTask({
    type: TaskType.CUSTOM,
    priority: TaskPriority.LOW,
    data: { name: 'Low-2', priority: 'LOW' }
  });

  scheduler.start();

  setTimeout(() => {
    scheduler.stop();
    console.log('执行顺序:', executionOrder);
    // 应该是: High-1, Normal-1, Low-1, Low-2
  }, 2000);
}

// ============ 测试3: 异步任务和超时 ============
function testAsyncAndTimeout() {
  console.log('\n=== 测试3: 异步任务和超时 ===');
  
  const scheduler = new TaskScheduler();

  // 快速任务
  scheduler.registerExecutor(TaskType.CUSTOM, async (data) => {
    await new Promise(resolve => setTimeout(resolve, data.delay));
    return { name: data.name, delay: data.delay };
  });

  // 添加不同延迟的任务
  scheduler.addTask({
    type: TaskType.CUSTOM,
    data: { name: 'Fast', delay: 100 },
    timeout: 500
  });

  scheduler.addTask({
    type: TaskType.CUSTOM,
    data: { name: 'Slow', delay: 2000 },
    timeout: 1000  // 会超时
  });

  scheduler.on(TaskEvent.TASK_COMPLETED, ({ taskId, result }) => {
    console.log(`✓ 完成: ${result.name}`);
  });

  scheduler.on(TaskEvent.TASK_FAILED, ({ taskId, error }) => {
    console.log(`✗ 失败: ${error.message}`);
  });

  scheduler.start();

  setTimeout(() => scheduler.stop(), 3000);
}

// ============ 测试4: 任务依赖 ============
function testDependencies() {
  console.log('\n=== 测试4: 任务依赖 ===');
  
  const scheduler = new TaskScheduler();

  scheduler.registerExecutor(TaskType.CUSTOM, async (data) => {
    console.log(`执行: ${data.name}`);
    await new Promise(resolve => setTimeout(resolve, 500));
    return { name: data.name };
  });

  // 任务A
  const taskA = scheduler.addTask({
    id: 'task-a',
    type: TaskType.CUSTOM,
    data: { name: 'Task A (无依赖)' }
  });

  // 任务B 依赖 A
  const taskB = scheduler.addTask({
    id: 'task-b',
    type: TaskType.CUSTOM,
    data: { name: 'Task B (依赖A)' },
    dependencies: [taskA]
  });

  // 任务C 依赖 B
  scheduler.addTask({
    id: 'task-c',
    type: TaskType.CUSTOM,
    data: { name: 'Task C (依赖B)' },
    dependencies: [taskB]
  });

  scheduler.start();

  setTimeout(() => scheduler.stop(), 3000);
}

// ============ 测试5: 失败重试 ============
function testRetry() {
  console.log('\n=== 测试5: 失败重试 ===');
  
  const scheduler = new TaskScheduler();

  let attemptCount = 0;

  scheduler.registerExecutor(TaskType.CUSTOM, async (data) => {
    attemptCount++;
    console.log(`尝试 ${attemptCount}: ${data.name}`);
    
    if (attemptCount < 3) {
      throw new Error('模拟失败');
    }
    
    return { success: true, attempts: attemptCount };
  });

  scheduler.addTask({
    type: TaskType.CUSTOM,
    data: { name: 'Retry Task' },
    retryCount: 3  // 最多重试3次
  });

  scheduler.on(TaskEvent.TASK_COMPLETED, ({ result }) => {
    console.log(`✓ 最终成功，尝试次数: ${result.attempts}`);
  });

  scheduler.on(TaskEvent.TASK_FAILED, ({ error }) => {
    console.log(`✗ 最终失败: ${error.message}`);
  });

  scheduler.start();

  setTimeout(() => scheduler.stop(), 5000);
}

// ============ 测试6: 可中断任务 ============
function testInterruptible() {
  console.log('\n=== 测试6: 可中断任务 ===');
  
  const scheduler = new TaskScheduler();

  scheduler.registerExecutor(TaskType.COMPUTE, async (data, context) => {
    for (let i = 0; i < 100; i++) {
      // 检查中止信号
      if (context.signal.aborted) {
        throw new Error('Task cancelled');
      }
      
      console.log(`计算进度: ${i}%`);
      context.reportProgress(i);
      
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    return { completed: true };
  });

  const taskId = scheduler.addTask({
    type: TaskType.COMPUTE,
    interruptible: true,
    data: {},
    onProgress: (progress) => {
      console.log(`进度回调: ${progress}%`);
    }
  });

  scheduler.start();

  // 2秒后取消任务
  setTimeout(() => {
    console.log('取消任务...');
    scheduler.cancelTask(taskId);
  }, 2000);

  setTimeout(() => scheduler.stop(), 6000);
}

// ============ 测试7: 性能监控 ============
function testPerformanceMonitoring() {
  console.log('\n=== 测试7: 性能监控 ===');
  
  const scheduler = new TaskScheduler({
    maxTasksPerFrame: 10
  });

  const monitor = new PerformanceMonitor(scheduler);

  // 设置警告阈值
  monitor.setThreshold(PerformanceWarning.LOW_FPS, 50);
  monitor.setThreshold(PerformanceWarning.QUEUE_BUILDUP, 20);

  // 监听警告
  monitor.onWarning(PerformanceWarning.LOW_FPS, (data) => {
    console.warn(`⚠ FPS过低: ${data.currentFPS}`);
  });

  monitor.onWarning(PerformanceWarning.QUEUE_BUILDUP, (data) => {
    console.warn(`⚠ 队列堆积: ${data.currentQueueSize}`);
  });

  // 注册执行器
  scheduler.registerExecutor(TaskType.CUSTOM, async (data) => {
    // 模拟耗时操作
    const start = performance.now();
    while (performance.now() - start < 5) {
      // 忙等待5ms
    }
    return { name: data.name };
  });

  // 开始监控
  monitor.start(1000);

  // 批量添加任务
  for (let i = 0; i < 100; i++) {
    scheduler.addTask({
      type: TaskType.CUSTOM,
      data: { name: `Task-${i}` }
    });
  }

  scheduler.start();

  // 定期输出报告
  const reportInterval = setInterval(() => {
    console.log('\n' + monitor.generateReport());
  }, 3000);

  setTimeout(() => {
    clearInterval(reportInterval);
    monitor.stop();
    scheduler.stop();
  }, 10000);
}

// ============ 测试8: 消息协议 ============
function testMessageProtocol() {
  console.log('\n=== 测试8: 消息协议 ===');
  
  const scheduler = new TaskScheduler();
  const messageHandler = new MessageHandler(scheduler);

  scheduler.registerExecutor(TaskType.CUSTOM, async (data) => {
    return { processed: data };
  });

  scheduler.start();

  // 测试添加任务消息
  const addTaskMsg = {
    id: 'msg-001',
    type: MessageType.ADD_TASK,
    payload: {
      type: TaskType.CUSTOM,
      priority: TaskPriority.NORMAL,
      data: { test: 'data' }
    },
    timestamp: Date.now()
  };

  messageHandler.handleMessage(addTaskMsg).then(response => {
    console.log('添加任务响应:', response);
    
    // 获取任务状态
    const statusMsg = {
      id: 'msg-002',
      type: MessageType.GET_STATUS,
      payload: { taskId: response.data.taskId },
      timestamp: Date.now()
    };
    
    return messageHandler.handleMessage(statusMsg);
  }).then(response => {
    console.log('任务状态:', response);
  });

  // 批量消息
  const batchMessages = [
    {
      id: 'batch-001',
      type: MessageType.ADD_TASK,
      payload: { type: TaskType.CUSTOM, data: { id: 1 } },
      timestamp: Date.now()
    },
    {
      id: 'batch-002',
      type: MessageType.ADD_TASK,
      payload: { type: TaskType.CUSTOM, data: { id: 2 } },
      timestamp: Date.now()
    }
  ];

  messageHandler.handleMessages(batchMessages).then(responses => {
    console.log('批量响应:', responses);
  });

  setTimeout(() => scheduler.stop(), 3000);
}

// ============ 测试9: 压力测试 ============
function testStress() {
  console.log('\n=== 测试9: 压力测试 ===');
  
  const scheduler = new TaskScheduler({
    maxTasksPerFrame: 20,
    frameTimeBudget: 10,
    maxConcurrentTasks: 5
  });

  const monitor = new PerformanceMonitor(scheduler);

  scheduler.registerExecutor(TaskType.CUSTOM, async (data) => {
    // 模拟工作
    const iterations = Math.random() * 1000;
    for (let i = 0; i < iterations; i++) {
      Math.sqrt(i);
    }
    return { id: data.id };
  });

  monitor.start(1000);
  scheduler.start();

  // 持续添加任务
  let taskCounter = 0;
  const addTasks = setInterval(() => {
    for (let i = 0; i < 10; i++) {
      scheduler.addTask({
        type: TaskType.CUSTOM,
        priority: Math.random() > 0.5 ? TaskPriority.NORMAL : TaskPriority.LOW,
        data: { id: taskCounter++ }
      });
    }
  }, 100);

  // 输出统计
  const statsInterval = setInterval(() => {
    const stats = scheduler.getStats();
    console.log(`FPS: ${stats.fps} | 待处理: ${stats.pendingTasks} | 已完成: ${stats.completedTasks}`);
  }, 1000);

  setTimeout(() => {
    clearInterval(addTasks);
    clearInterval(statsInterval);
    
    console.log('\n最终报告:');
    console.log(monitor.generateReport());
    
    monitor.stop();
    scheduler.stop();
  }, 10000);
}

// ============ 运行所有测试 ============
export function runAllTests() {
  console.log('开始运行所有测试...\n');
  
  // 按顺序运行测试，每个测试间隔足够时间
  const tests = [
    testBasicScheduling,
    testPriorityScheduling,
    testAsyncAndTimeout,
    testDependencies,
    testRetry,
    testInterruptible,
    testPerformanceMonitoring,
    testMessageProtocol,
    testStress
  ];

  let currentTest = 0;
  
  function runNext() {
    if (currentTest < tests.length) {
      tests[currentTest]();
      currentTest++;
      setTimeout(runNext, 12000); // 每个测试间隔12秒
    } else {
      console.log('\n所有测试完成！');
    }
  }

  runNext();
}

// 运行单个测试（取消注释来运行）
// testBasicScheduling();
// testPriorityScheduling();
// testAsyncAndTimeout();
// testDependencies();
// testRetry();
// testInterruptible();
// testPerformanceMonitoring();
// testMessageProtocol();
// testStress();

// 运行所有测试
// runAllTests();
