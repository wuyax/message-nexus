# MessageNexus Monorepo

一个统一、类型安全、支持多种传输协议的跨上下文消息通信库。

## Monorepo 结构

这是一个使用 pnpm workspaces 的 monorepo 项目，包含以下包：

- **`packages/message-nexus`**: 核心 npm 包
- **`packages/example`**: Vue3 示例应用，用于验证和演示

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 开发

启动 Vue3 示例应用（热更新）：

```bash
pnpm dev
```

### 构建

构建所有包：

```bash
pnpm build
```

仅构建核心包：

```bash
pnpm build:core
```

仅构建示例应用：

```bash
pnpm build:example
```

### 测试

运行测试（带监视模式）：

```bash
pnpm test
```

运行测试（单次运行）：

```bash
pnpm test:run
```

### 类型检查

```bash
pnpm type-check
```

### 格式化代码

```bash
pnpm lint
```

## message-nexus

核心消息通信库，支持以下特性：

- **统一接口**: 支持 Mitt（进程内）、PostMessage（iframe/window 间）、BroadcastChannel（跨标签页）、WebSocket（网络通信）
- **类型安全**: 完整的 TypeScript 支持，泛型类型推断
- **请求-响应模式**: Promise 风格的异步通信，内置超时保护
- **自动重连**: WebSocket 自动重连机制，支持指数退避
- **消息队列**: 离线消息缓存，连接恢复后自动发送
- **重试机制**: 请求失败自动重试，可配置重试次数和延迟
- **消息验证**: 运行时消息格式验证，防止非法消息
- **监控指标**: 内置消息统计和性能监控
- **结构化日志**: 支持自定义日志处理器，便于调试和生产监控

### 使用示例

```typescript
import { createEmitter, MittDriver, MessageNexus } from 'message-nexus'

// 使用工厂函数创建独立的 emitter 实例
const emitter = createEmitter()
const driver = new MittDriver(emitter)
const nexus = new MessageNexus(driver)

// 发送请求
const response = await nexus.request({
  type: 'GET_DATA',
  payload: { id: 123 },
})

// 监听命令
const unsubscribe = nexus.onCommand((data) => {
  if (data.type === 'GET_DATA') {
    nexus.reply(data.id, { name: 'test', value: 42 })
  }
})

// 清理资源（重要！）
nexus.destroy()
```

详细 API 文档请参考 [packages/message-nexus](./packages/message-nexus/README.md)。

### 示例应用

Vue3 示例应用包含以下演示页面：

| 路由           | 演示内容                               |
| -------------- | -------------------------------------- |
| `/`            | MittDriver - 进程内通信                |
| `/postmessage` | PostMessageDriver - 跨窗口/iframe 通信 |
| `/broadcast`   | BroadcastDriver - 跨标签页通信         |

运行示例：

```bash
pnpm dev
```

然后访问 http://localhost:5173

## 工作空间命令

在 monorepo 根目录，你可以使用以下命令针对特定工作空间执行操作：

```bash
# 在 message-nexus 包中运行命令
pnpm --filter message-nexus <command>

# 在 example 包中运行命令
pnpm --filter @message-nexus/example <command>

# 在所有包中运行命令
pnpm --filter ./packages/** <command>
```

## 发布流程

### 1. 更新版本号

```bash
pnpm --filter message-nexus version <major|minor|patch>
```

### 2. 构建包

```bash
pnpm build:core
```

### 3. 发布到 npm

```bash
pnpm --filter message-nexus publish
```

## 许可证

MIT
