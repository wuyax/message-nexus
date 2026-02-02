# @message-bridge/core

一个统一、类型安全、支持多种传输协议的跨上下文消息通信库。

## 安装

```bash
npm install @message-bridge/core
# or
pnpm add @message-bridge/core
```

## 特性

- **统一接口**: 支持 Mitt（进程内）、PostMessage（iframe/window 间）、WebSocket（网络通信）
- **类型安全**: 完整的 TypeScript 支持，泛型类型推断
- **请求-响应模式**: Promise 风格的异步通信，内置超时保护
- **自动重连**: WebSocket 自动重连机制，支持指数退避
- **消息队列**: 离线消息缓存，连接恢复后自动发送
- **重试机制**: 请求失败自动重试，可配置重试次数和延迟
- **消息验证**: 运行时消息格式验证，防止非法消息
- **监控指标**: 内置消息统计和性能监控
- **结构化日志**: 支持自定义日志处理器，便于调试和生产监控

## 快速开始

### 1. 进程内通信（Mitt）

```typescript
import mitt from 'mitt'
import { MittDriver, MessageBridge } from '@message-bridge/core'

const emitter = mitt()
const driver = new MittDriver(emitter)
const bridge = new MessageBridge(driver)

// 发送请求
const response = await bridge.request('GET_DATA', { id: 123 })
console.log(response)

// 监听命令
const unsubscribe = bridge.onCommand((data) => {
  if (data.type === 'GET_DATA') {
    bridge.reply(data.id, { name: 'test', value: 42 })
  }
})
```

### 2. iframe/Window 通信（PostMessage）

```typescript
import { PostMessageDriver, MessageBridge } from '@message-bridge/core'

// 发送方
const driver = new PostMessageDriver(window.parent, 'https://example.com')
const bridge = new MessageBridge(driver)

const response = await bridge.request('PING')
console.log('Pong:', response)

// 接收方
const iframeDriver = new PostMessageDriver(iframe.contentWindow, 'https://example.com')
const iframeBridge = new MessageBridge(iframeDriver)

iframeBridge.onCommand((data) => {
  if (data.type === 'PING') {
    bridge.reply(data.id, { time: Date.now() })
  }
})
```

### 3. WebSocket 通信

```typescript
import { WebSocketDriver, MessageBridge } from '@message-bridge/core'

// 自动重连配置
const driver = new WebSocketDriver({
  url: 'wss://api.example.com/ws',
  reconnect: {
    maxRetries: 5, // 最大重试次数
    retryInterval: 3000, // 重试间隔（毫秒）
  },
})

const bridge = new MessageBridge(driver)

// 发送请求
const response = await bridge.request({
  type: 'GET_USER',
  payload: { userId: 123 },
  timeout: 5000,
  retryCount: 3, // 失败重试 3 次
  retryDelay: 1000, // 重试延迟
})
```

## API 文档

### MessageBridge

#### 构造函数

```typescript
new MessageBridge<RequestPayload, ResponsePayload>(
  driver: BaseDriver,
  options?: MessageBridgeOptions
)
```

**Options:**

| 参数       | 类型   | 默认值         | 说明                  |
| ---------- | ------ | -------------- | --------------------- |
| instanceId | string | auto-generated | 实例 ID，用于消息路由 |
| timeout    | number | 10000          | 请求超时时间（毫秒）  |
| logger     | Logger | new Logger()   | 日志实例              |

#### 方法

##### request()

发送请求并等待响应。

```typescript
bridge.request(typeOrOptions: string | RequestOptions): Promise<ResponsePayload>
```

**Options:**

| 参数       | 类型                    | 必填 | 说明                 |
| ---------- | ----------------------- | ---- | -------------------- |
| type       | string                  | 是   | 消息类型             |
| payload    | unknown                 | 否   | 请求数据             |
| to         | string                  | 否   | 目标实例 ID          |
| metadata   | Record<string, unknown> | 否   | 元数据               |
| timeout    | number                  | 否   | 超时时间（覆盖全局） |
| retryCount | number                  | 否   | 失败重试次数         |
| retryDelay | number                  | 否   | 重试延迟（毫秒）     |

**示例：**

```typescript
// 简单请求
const result = await bridge.request('FETCH_DATA')

// 完整配置
const result = await bridge.request({
  type: 'FETCH_DATA',
  payload: { id: 123 },
  to: 'target-instance',
  timeout: 5000,
  retryCount: 3,
  retryDelay: 1000,
})
```

##### onCommand()

注册消息处理器。

```typescript
bridge.onCommand(handler: (data: CommandMessage) => void): () => void
```

**返回值:** 取消监听的函数

**示例：**

```typescript
const unsubscribe = bridge.onCommand((data) => {
  console.log('Received:', data.type, data.payload)

  if (data.type === 'ECHO') {
    bridge.reply(data.id, { echoed: data.payload })
  }
})

// 取消监听
unsubscribe()
```

##### reply()

回复传入消息。

```typescript
bridge.reply(messageId: string, payload: unknown, error?: unknown)
```

**示例：**

```typescript
bridge.reply('message-id-123', { success: true })
bridge.reply('message-id-456', null, new Error('Invalid request'))
```

##### onError()

注册错误处理器。

```typescript
bridge.onError(handler: ErrorHandler): () => void
```

**示例：**

```typescript
bridge.onError((error, context) => {
  console.error('Bridge error:', error.message, context)
  // 发送到错误追踪服务
  Sentry.captureException(error, { extra: context })
})
```

##### getMetrics()

获取监控指标。

```typescript
bridge.getMetrics(): Metrics
```

**返回值:**

```typescript
{
  messagesSent: number // 发送消息数
  messagesReceived: number // 接收消息数
  messagesFailed: number // 失败消息数
  pendingMessages: number // 待处理消息数
  queuedMessages: number // 队列消息数
  totalLatency: number // 总延迟（毫秒）
  averageLatency: number // 平均延迟（毫秒）
}
```

**示例：**

```typescript
const metrics = bridge.getMetrics()
console.log(`Avg latency: ${metrics.averageLatency}ms`)
console.log(
  `Success rate: ${((metrics.messagesReceived / metrics.messagesSent) * 100).toFixed(2)}%`,
)
```

##### onMetrics()

注册指标变更回调。

```typescript
bridge.onMetrics(callback: MetricsCallback): () => void
```

**示例：**

```typescript
const unsubscribe = bridge.onMetrics((metrics) => {
  // 发送到监控系统
  metricsService.report(metrics)
})
```

##### flushQueue()

刷新消息队列，发送所有缓存的消息。

```typescript
bridge.flushQueue()
```

##### destroy()

销毁实例，清理资源。

```typescript
bridge.destroy()
```

### WebSocketDriver

#### 构造函数

```typescript
new WebSocketDriver(options: WebSocketDriverOptions)
```

**Options:**

| 参数      | 类型                        | 默认值       | 说明          |
| --------- | --------------------------- | ------------ | ------------- |
| url       | string                      | 必填         | WebSocket URL |
| reconnect | boolean \| ReconnectOptions | true         | 是否自动重连  |
| logger    | Logger                      | new Logger() | 日志实例      |

**ReconnectOptions:**

| 参数          | 类型   | 默认值   | 说明             |
| ------------- | ------ | -------- | ---------------- |
| maxRetries    | number | Infinity | 最大重试次数     |
| retryInterval | number | 5000     | 重试间隔（毫秒） |

**示例：**

```typescript
const driver = new WebSocketDriver({
  url: 'wss://api.example.com/ws',
  reconnect: {
    maxRetries: 10,
    retryInterval: 3000,
  },
})
```

#### 方法

##### close()

关闭连接并停止重连。

```typescript
driver.close()
```

### PostMessageDriver

#### 构造函数

```typescript
new PostMessageDriver(targetWindow: Window, targetOrigin: string)
```

**参数:**

| 参数         | 类型   | 必填 | 说明                                  |
| ------------ | ------ | ---- | ------------------------------------- |
| targetWindow | Window | 是   | 目标窗口对象                          |
| targetOrigin | string | 是   | 目标源地址（安全要求，不能使用 '\*'） |

**示例：**

```typescript
const driver = new PostMessageDriver(window.parent, 'https://app.example.com')
```

### MittDriver

#### 构造函数

```typescript
new MittDriver(emitter: Emitter<Record<string, Message>>)
```

**示例：**

```typescript
import mitt from 'mitt'

const emitter = mitt()
const driver = new MittDriver(emitter)
```

## Logger 日志

### 基本使用

```typescript
import { Logger, createConsoleHandler, LogLevel } from '@message-bridge/core/utils/logger'

const logger = new Logger('MyApp', LogLevel.DEBUG)
logger.addHandler(createConsoleHandler())

logger.debug('Debug message', { data: 123 })
logger.info('Info message')
logger.warn('Warning message')
logger.error('Error message', { error: new Error('test') })
```

### 自定义日志处理器

```typescript
const apiHandler = (entry) => {
  fetch('/api/logs', {
    method: 'POST',
    body: JSON.stringify(entry),
  })
}

logger.addHandler(apiHandler)
```

### 设置日志级别

```typescript
logger.setMinLevel(LogLevel.WARN) // 只输出 WARN 和 ERROR
```

### 在 Bridge 中使用

```typescript
import { Logger } from '@message-bridge/core/utils/logger'

const logger = new Logger('MyBridge')
const bridge = new MessageBridge(driver, { logger })
```

## 设计亮点

### 1. 类型安全

MessageBridge 使用 TypeScript 泛型提供完整的类型推断：

```typescript
interface UserRequest {
  userId: number
}

interface UserResponse {
  id: number
  name: string
}

const bridge = new MessageBridge<UserRequest, UserResponse>(driver)

// 完整的类型推断
const response = await bridge.request({
  type: 'GET_USER',
  payload: { userId: 123 }, // 类型: UserRequest
})

// response 类型: UserResponse
console.log(response.name)
```

### 2. 内存安全

- **自动清理**: 定期清理过期的消息记录
- **手动清理**: `reply()` 后立即删除记录
- **资源释放**: `destroy()` 方法清理所有定时器
- **队列限制**: 消息队列有最大大小限制，防止无限增长

### 3. 错误恢复

- **自动重连**: WebSocket 断线自动重连，指数退避策略
- **请求重试**: 失败请求自动重试，可配置次数和延迟
- **消息队列**: 离线消息缓存，连接恢复后自动发送
- **错误回调**: 统一的错误处理机制

### 4. 安全加固

- **PostMessage**: 禁止使用 `'*'` 作为 targetOrigin，必须明确指定源地址
- **消息验证**: 运行时验证消息格式，防止非法消息导致崩溃
- **来源过滤**: 自动过滤非目标消息

### 5. 可观测性

内置监控指标，便于生产环境监控：

```typescript
const metrics = bridge.getMetrics()

console.log(`Messages: ${metrics.messagesSent} sent, ${metrics.messagesReceived} received`)
console.log(
  `Success rate: ${((metrics.messagesReceived / metrics.messagesSent) * 100).toFixed(2)}%`,
)
console.log(`Avg latency: ${metrics.averageLatency}ms`)
console.log(`Pending: ${metrics.pendingMessages}, Queued: ${metrics.queuedMessages}`)
```

### 6. 结构化日志

统一的日志接口，支持多种输出方式：

```typescript
// 控制台输出
logger.addHandler(createConsoleHandler())

// 发送到 API
logger.addHandler((entry) => {
  fetch('/api/logs', { body: JSON.stringify(entry) })
})

// 发送到 ELK
logger.addHandler((entry) => {
  elk.send(entry)
})
```

## 测试

运行单元测试：

```bash
cd packages/message-bridge
pnpm test:run
```

## 许可证

MIT
