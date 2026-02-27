# @message-nexus/server

一个用于测试 `message-nexus` WebSocket 驱动的简单 Node.js WebSocket 服务端。

## 特性

- **WebSocket 支持**: 基于 `ws` 库实现的轻量级 WebSocket 服务。
- **消息广播**: 自动将接收到的消息广播给所有其他已连接的客户端（用于模拟跨客户端通信）。
- **简单易用**: 零配置启动，支持环境变量配置端口。
- **优雅停机**: 支持 SIGINT 信号处理，确保连接安全关闭。

## 快速开始

### 安装依赖

在项目根目录下运行：

```bash
pnpm install
```

### 启动服务

```bash
pnpm dev:ws
```

默认在 `8080` 端口启动。

### 配置端口

可以通过 `WS_PORT` 环境变量自定义端口：

```bash
WS_PORT=9000 pnpm dev:ws
```

## 在 MessageNexus 中使用

配合 `message-nexus` 的 `WebSocketDriver` 使用：

```typescript
import { MessageNexus, WebSocketDriver } from 'message-nexus'

const driver = new WebSocketDriver('ws://localhost:8080')
const nexus = new MessageNexus(driver)

// 连接成功后即可进行通信
```

## 开发与调试

服务端启动后会输出连接和消息日志，便于调试 `WebSocketDriver` 的连接、重连和消息传输机制。

```bash
[2026-02-27T08:39:35.000Z] WebSocket server starting on port 8080...
[2026-02-27T08:39:35.000Z] WebSocket server running
[2026-02-27T08:39:35.000Z] Connect with: ws://localhost:8080
```
