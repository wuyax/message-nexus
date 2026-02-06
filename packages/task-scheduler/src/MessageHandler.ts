import { TaskScheduler } from './TaskScheduler';
import { TaskType, TaskPriority, TaskConfig } from './types';

/**
 * 消息类型
 */
export enum MessageType {
  ADD_TASK = 'add_task',
  CANCEL_TASK = 'cancel_task',
  GET_STATUS = 'get_status',
  GET_RESULT = 'get_result',
  GET_STATS = 'get_stats',
  CLEAR_TASKS = 'clear_tasks'
}

/**
 * 消息接口
 */
export interface Message {
  id: string;                    // 消息ID
  type: MessageType;             // 消息类型
  payload: any;                  // 消息数据
  timestamp: number;             // 时间戳
}

/**
 * 响应接口
 */
export interface Response {
  messageId: string;             // 对应的消息ID
  success: boolean;              // 是否成功
  data?: any;                    // 响应数据
  error?: string;                // 错误信息
  timestamp: number;             // 时间戳
}

/**
 * 消息协议处理器
 * 将外部消息转换为任务调度器调用
 */
export class MessageHandler {
  private scheduler: TaskScheduler;
  private messageHandlers: Map<MessageType, (payload: any) => Promise<any>>;

  constructor(scheduler: TaskScheduler) {
    this.scheduler = scheduler;
    this.messageHandlers = new Map();
    this.registerHandlers();
  }

  /**
   * 注册消息处理器
   */
  private registerHandlers(): void {
    // 添加任务
    this.messageHandlers.set(MessageType.ADD_TASK, async (payload) => {
      const config = this.validateTaskConfig(payload);
      const taskId = this.scheduler.addTask(config);
      return { taskId };
    });

    // 取消任务
    this.messageHandlers.set(MessageType.CANCEL_TASK, async (payload) => {
      const { taskId } = payload;
      if (!taskId) {
        throw new Error('taskId is required');
      }
      const cancelled = this.scheduler.cancelTask(taskId);
      return { cancelled };
    });

    // 获取任务状态
    this.messageHandlers.set(MessageType.GET_STATUS, async (payload) => {
      const { taskId } = payload;
      if (!taskId) {
        throw new Error('taskId is required');
      }
      const status = this.scheduler.getTaskStatus(taskId);
      return { taskId, status };
    });

    // 获取任务结果
    this.messageHandlers.set(MessageType.GET_RESULT, async (payload) => {
      const { taskId } = payload;
      if (!taskId) {
        throw new Error('taskId is required');
      }
      const result = this.scheduler.getTaskResult(taskId);
      return { taskId, result };
    });

    // 获取统计信息
    this.messageHandlers.set(MessageType.GET_STATS, async () => {
      const stats = this.scheduler.getStats();
      return stats;
    });

    // 清空任务
    this.messageHandlers.set(MessageType.CLEAR_TASKS, async () => {
      this.scheduler.clear();
      return { cleared: true };
    });
  }

  /**
   * 处理消息
   */
  public async handleMessage(message: Message): Promise<Response> {
    // const startTime = performance.now();

    try {
      // 验证消息格式
      this.validateMessage(message);

      // 获取处理器
      const handler = this.messageHandlers.get(message.type);
      if (!handler) {
        throw new Error(`Unknown message type: ${message.type}`);
      }

      // 执行处理器
      const data = await handler(message.payload);

      return {
        messageId: message.id,
        success: true,
        data,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        messageId: message.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      };
    }
  }

  /**
   * 批量处理消息
   */
  public async handleMessages(messages: Message[]): Promise<Response[]> {
    return Promise.all(messages.map(msg => this.handleMessage(msg)));
  }

  /**
   * 验证消息格式
   */
  private validateMessage(message: Message): void {
    if (!message.id) {
      throw new Error('Message id is required');
    }
    if (!message.type) {
      throw new Error('Message type is required');
    }
    if (message.payload === undefined) {
      throw new Error('Message payload is required');
    }
  }

  /**
   * 验证任务配置
   */
  private validateTaskConfig(payload: any): TaskConfig {
    if (!payload.type) {
      throw new Error('Task type is required');
    }

    // 验证任务类型
    if (!Object.values(TaskType).includes(payload.type)) {
      throw new Error(`Invalid task type: ${payload.type}`);
    }

    // 验证优先级
    if (payload.priority !== undefined && 
        !Object.values(TaskPriority).includes(payload.priority)) {
      throw new Error(`Invalid priority: ${payload.priority}`);
    }

    return {
      id: payload.id,
      type: payload.type,
      priority: payload.priority,
      data: payload.data,
      interruptible: payload.interruptible,
      retryCount: payload.retryCount,
      timeout: payload.timeout,
      dependencies: payload.dependencies
    };
  }
}

/**
 * WebSocket 消息处理器示例
 */
export class WebSocketMessageHandler {
  private messageHandler: MessageHandler;
  private ws: WebSocket | null = null;

  constructor(scheduler: TaskScheduler) {
    this.messageHandler = new MessageHandler(scheduler);
  }

  /**
   * 连接 WebSocket
   */
  public connect(url: string): void {
    this.ws = new WebSocket(url);

    this.ws.onmessage = async (event) => {
      try {
        const message: Message = JSON.parse(event.data);
        const response = await this.messageHandler.handleMessage(message);
        this.send(response);
      } catch (error) {
        console.error('Failed to handle WebSocket message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket closed');
    };
  }

  /**
   * 发送响应
   */
  private send(response: Response): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(response));
    }
  }

  /**
   * 关闭连接
   */
  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

/**
 * PostMessage 消息处理器示例（用于 Worker 或 iframe）
 */
export class PostMessageHandler {
  private messageHandler: MessageHandler;

  constructor(scheduler: TaskScheduler) {
    this.messageHandler = new MessageHandler(scheduler);
    this.setupListener();
  }

  /**
   * 设置消息监听
   */
  private setupListener(): void {
    self.addEventListener('message', async (event) => {
      try {
        const message: Message = event.data;
        const response = await this.messageHandler.handleMessage(message);
        self.postMessage(response);
      } catch (error) {
        console.error('Failed to handle postMessage:', error);
      }
    });
  }
}

// ========== 使用示例 ==========

/**
 * 示例：通过消息调用任务调度器
 */
export function exampleMessageUsage() {
  const scheduler = new TaskScheduler();
  const messageHandler = new MessageHandler(scheduler);

  // 添加任务的消息
  const addTaskMessage: Message = {
    id: 'msg_001',
    type: MessageType.ADD_TASK,
    payload: {
      type: TaskType.ADD_OBJECT,
      priority: TaskPriority.NORMAL,
      data: {
        geometry: 'box',
        material: { color: 0xff0000 },
        position: { x: 0, y: 0, z: 0 }
      },
      timeout: 5000,
      retryCount: 2
    },
    timestamp: Date.now()
  };

  // 处理消息
  messageHandler.handleMessage(addTaskMessage).then(response => {
    console.log('Response:', response);
    // Response: {
    //   messageId: 'msg_001',
    //   success: true,
    //   data: { taskId: 'task_1_...' },
    //   timestamp: ...
    // }
  });

  // 获取统计信息的消息
  const getStatsMessage: Message = {
    id: 'msg_002',
    type: MessageType.GET_STATS,
    payload: {},
    timestamp: Date.now()
  };

  messageHandler.handleMessage(getStatsMessage).then(response => {
    console.log('Stats:', response.data);
  });

  // 批量处理消息
  const messages: Message[] = [
    {
      id: 'msg_003',
      type: MessageType.ADD_TASK,
      payload: {
        type: TaskType.ADD_OBJECT,
        data: { geometry: 'sphere' }
      },
      timestamp: Date.now()
    },
    {
      id: 'msg_004',
      type: MessageType.ADD_TASK,
      payload: {
        type: TaskType.ADD_OBJECT,
        data: { geometry: 'cylinder' }
      },
      timestamp: Date.now()
    }
  ];

  messageHandler.handleMessages(messages).then(responses => {
    console.log('Batch responses:', responses);
  });
}
