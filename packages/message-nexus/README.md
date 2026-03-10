# message-nexus

A unified, type-safe cross-context message communication library supporting multiple transport protocols.

## Installation

```bash
npm install message-nexus
# or
pnpm add message-nexus
```

## Features

- **Unified Interface**: Supports Mitt (in-process), PostMessage (iframe/window), BroadcastChannel (cross-tab), and WebSocket (network communication)
- **JSON-RPC 2.0 Compliance**: Strict adherence to the JSON-RPC 2.0 specification for standardized communication
- **Envelope Pattern**: Extensible message envelope containing routing information (from, to) and metadata
- **Type Safety**: Full TypeScript support with generic type inference
- **Request-Response Pattern**: Promise-style asynchronous communication with built-in timeout protection
- **Auto Reconnect**: WebSocket automatic reconnection mechanism with exponential backoff support
- **Message Queue**: Offline message caching, automatically sent after connection recovery
- **Retry Mechanism**: Automatic retry on request failure, configurable retry counts and delays
- **Message Validation**: Runtime message format validation to prevent illegal messages
- **Monitoring Metrics**: Built-in message statistics and performance monitoring
- **Structured Logging**: Supports custom log handlers for easy debugging and production monitoring
- **Resource Management**: All drivers support the `destroy()` method to properly clean up resources.

## Quick Start

### 1. In-Process Communication (Mitt)

```typescript
import MessageNexus, { MittDriver, createEmitter } from 'message-nexus'

// Shared emitter
const emitter = createEmitter()

const driver = new MittDriver(emitter)
const nexus = new MessageNexus(driver)

// Send request
const response = await nexus.request('GET_DATA', { id: 123 })
console.log(response)

// Listen for commands
const receiverDriver = new MittDriver(emitter)
const receiverNexus = new MessageNexus(receiverDriver)
const unsubscribe = receiverNexus.onCommand((data) => {
  if (data.payload.method === 'GET_DATA') {
    receiverNexus.reply(data.payload.id as string, { name: 'test', value: 42 })
  }
})
```

### 2. iframe/Window Communication (PostMessage)

```typescript
import MessageNexus, { PostMessageDriver } from 'message-nexus'

// Sender
const driver = new PostMessageDriver(window.parent, 'https://example.com')
const nexus = new MessageNexus(driver)

const response = await nexus.request('PING')
console.log('Pong:', response)

// Receiver
const iframeDriver = new PostMessageDriver(iframe.contentWindow, 'https://example.com')
const iframeNexus = new MessageNexus(iframeDriver)

iframeNexus.onCommand((data) => {
  if (data.payload.method === 'PING') {
    iframeNexus.reply(data.payload.id as string, { time: Date.now() })
  }
})
```

### 3. Cross-Tab Communication (BroadcastChannel)

```typescript
import MessageNexus, { BroadcastDriver } from 'message-nexus'

// Create BroadcastDriver, specifying the channel name
const driver = new BroadcastDriver({ channel: 'my-app-channel' })
const nexus = new MessageNexus(driver)

// Listen for commands
nexus.onCommand((data) => {
  console.log('Received:', data.payload.method, data.payload.params)
  nexus.reply(data.payload.id as string, { result: 'success' })
})

// Send request (will be broadcast to all tabs on the same channel)
const response = await nexus.request({
  method: 'SYNC_STATE',
  params: { state: '...' },
})

// Receiver
const receiverDriver = new BroadcastDriver({ channel: 'my-app-channel' })
const receiverNexus = new MessageNexus(receiverDriver)
receiverNexus.onCommand((data) => {
  console.log('Received:', data.payload.method, data.payload.params)
  receiverNexus.reply(data.payload.id as string, { result: 'success' })
})
```

### 4. WebSocket Communication

```typescript
import MessageNexus, { WebSocketDriver } from 'message-nexus'

// Automatic reconnection configuration
const driver = new WebSocketDriver({
  url: 'wss://api.example.com/ws',
  reconnect: {
    maxRetries: 5, // Maximum retry count
    retryInterval: 3000, // Retry interval (milliseconds)
  },
})

const nexus = new MessageNexus(driver)

// Send request
const response = await nexus.request({
  method: 'GET_USER',
  params: { userId: 123 },
  timeout: 5000,
  retryCount: 3, // Retry 3 times on failure
  retryDelay: 1000, // Retry delay
})

// Receiver
const receiverDriver = new WebSocketDriver({
  url: 'wss://api.example.com/ws',
  reconnect: {
    maxRetries: 5, // Maximum retry count
    retryInterval: 3000, // Retry interval (milliseconds)
  },
})
const receiverNexus = new MessageNexus(receiverDriver)
receiverNexus.onCommand((data) => {
  console.log('Received:', data.payload.method, data.payload.params)
  receiverNexus.reply(data.payload.id as string, { result: 'success' })
})
```

## API Documentation

### MessageNexus

#### Constructor

```typescript
new MessageNexus<RequestPayload, ResponsePayload>(
  driver: BaseDriver,
  options?: MessageNexusOptions
)
```

**Options:**

| Parameter  | Type   | Default Value  | Description                           |
| ---------- | ------ | -------------- | ------------------------------------- |
| instanceId | string | auto-generated | Instance ID, used for message routing |
| timeout    | number | 10000          | Request timeout (milliseconds)        |
| logger     | Logger | new Logger()   | Logger instance                       |

#### Methods

##### request()

Send request and wait for response.

```typescript
nexus.request(methodOrOptions: string | RequestOptions): Promise<ResponsePayload>
```

**Options:**

| Parameter  | Type                    | Required | Description                  |
| ---------- | ----------------------- | -------- | ---------------------------- |
| method     | string                  | Yes      | Message method               |
| params     | unknown                 | No       | Request data                 |
| to         | string                  | No       | Target instance ID           |
| metadata   | Record<string, unknown> | No       | Metadata                     |
| timeout    | number                  | No       | Timeout (overrides global)   |
| retryCount | number                  | No       | Number of retries on failure |
| retryDelay | number                  | No       | Retry delay (milliseconds)   |

**Example:**

```typescript
// Simple request
const result = await nexus.request('FETCH_DATA')

// Full configuration
const result = await nexus.request({
  method: 'FETCH_DATA',
  params: { id: 123 },
  to: 'target-instance',
  timeout: 5000,
  retryCount: 3,
  retryDelay: 1000,
})
```

##### onCommand()

Register message handler.

```typescript
nexus.onCommand(handler: (data: CommandMessage) => void): () => void
```

**Return Value:** Unsubscribe function

**Example:**

```typescript
const unsubscribe = nexus.onCommand((data) => {
  console.log('Received:', data.payload.method, data.payload.params)

  if (data.payload.method === 'ECHO') {
    nexus.reply(data.payload.id as string, { echoed: data.payload.params })
  }
})

// Unsubscribe
unsubscribe()
```

##### reply()

Reply to incoming message.

```typescript
nexus.reply(messageId: string, payload: unknown, error?: unknown)
```

**Example:**

```typescript
nexus.reply('message-id-123', { success: true })
nexus.reply('message-id-456', null, new Error('Invalid request'))
```

##### onError()

Register error handler.

```typescript
nexus.onError(handler: ErrorHandler): () => void
```

**Example:**

```typescript
nexus.onError((error, context) => {
  console.error('Bridge error:', error.message, context)
  // Send to error tracking service
  Sentry.captureException(error, { extra: context })
})
```

##### getMetrics()

Get monitoring metrics.

```typescript
nexus.getMetrics(): Metrics
```

**Return Value:**

```typescript
{
  messagesSent: number // Messages sent
  messagesReceived: number // Messages received
  messagesFailed: number // Messages failed
  pendingMessages: number // Pending messages
  queuedMessages: number // Queued messages
  totalLatency: number // Total latency (milliseconds)
  averageLatency: number // Average latency (milliseconds)
}
```

**Example:**

```typescript
const metrics = nexus.getMetrics()
console.log(`Avg latency: ${metrics.averageLatency}ms`)
console.log(
  `Success rate: ${((metrics.messagesReceived / metrics.messagesSent) * 100).toFixed(2)}%`,
)
```

##### onMetrics()

Register metrics change callback.

```typescript
nexus.onMetrics(callback: MetricsCallback): () => void
```

**Example:**

```typescript
const unsubscribe = nexus.onMetrics((metrics) => {
  // Send to monitoring system
  metricsService.report(metrics)
})
```

##### flushQueue()

Flush the message queue, sending all cached messages.

```typescript
nexus.flushQueue()
```

##### destroy()

Destroy the instance and clean up resources.

```typescript
nexus.destroy()
```

**Note**: The `destroy()` method automatically calls the driver's `destroy()` method to clean up resources like event listeners. It is recommended to call this method when the component is unmounted to avoid memory leaks.

### WebSocketDriver

#### Constructor

```typescript
new WebSocketDriver(options: WebSocketDriverOptions)
```

**Options:**

| Parameter | Type                        | Default Value | Description                        |
| --------- | --------------------------- | ------------- | ---------------------------------- |
| url       | string                      | Required      | WebSocket URL                      |
| reconnect | boolean \| ReconnectOptions | true          | Whether to automatically reconnect |
| logger    | Logger                      | new Logger()  | Logger instance                    |

**ReconnectOptions:**

| Parameter     | Type   | Default Value | Description                   |
| ------------- | ------ | ------------- | ----------------------------- |
| maxRetries    | number | Infinity      | Maximum retry count           |
| retryInterval | number | 5000          | Retry interval (milliseconds) |

**Example:**

```typescript
const driver = new WebSocketDriver({
  url: 'wss://api.example.com/ws',
  reconnect: {
    maxRetries: 10,
    retryInterval: 3000,
  },
})
```

#### Methods

##### close()

Close connection and stop reconnection.

```typescript
driver.close()
```

### PostMessageDriver

#### Constructor

```typescript
new PostMessageDriver(targetWindow: Window, targetOrigin: string)
```

**Parameters:**

| Parameter    | Type   | Required | Description                                                       |
| ------------ | ------ | -------- | ----------------------------------------------------------------- |
| targetWindow | Window | Yes      | Target window object                                              |
| targetOrigin | string | Yes      | Target origin address (security requirement, '\*' cannot be used) |

**Example:**

```typescript
const driver = new PostMessageDriver(window.parent, 'https://app.example.com')
```

### MittDriver

#### Constructor

```typescript
new MittDriver(emitter: Emitter<Record<string, Message>>)
```

**Example:**

```typescript
import { createEmitter, MittDriver } from 'message-nexus'

// Use the factory function to create an independent emitter instance
const emitter = createEmitter()
const driver = new MittDriver(emitter)
```

**Note**: It is recommended to use the `createEmitter()` factory function to create an independent emitter instance.

### BroadcastDriver

#### Constructor

```typescript
new BroadcastDriver(options: BroadcastDriverOptions)
```

**BroadcastDriverOptions:**

| Parameter | Type   | Default Value | Description            |
| --------- | ------ | ------------- | ---------------------- |
| channel   | string | Required      | Broadcast channel name |

**Example:**

```typescript
import { BroadcastDriver, MessageNexus } from 'message-nexus'

const driver = new BroadcastDriver({ channel: 'my-app-channel' })
const nexus = new MessageNexus(driver)

// Listen for messages from other tabs
nexus.onCommand((data) => {
  console.log('Received from another tab:', data)
  nexus.reply(data.id, { received: true })
})

// Clean up resources
nexus.destroy()
```

**Features:**

- Multiple tabs under the same origin can communicate via the same channel name
- Automatically adds a protocol identifier to filter non-MessageNexus messages
- Supports dynamic channel switching

## Logger

### Basic Usage

```typescript
import { Logger, createConsoleHandler, LogLevel } from 'message-nexus/utils/logger'

const logger = new Logger('MyApp', LogLevel.DEBUG)
logger.addHandler(createConsoleHandler())

logger.debug('Debug message', { data: 123 })
logger.info('Info message')
logger.warn('Warning message')
logger.error('Error message', { error: new Error('test') })
```

### Custom Log Handler

```typescript
const apiHandler = (entry) => {
  fetch('/api/logs', {
    method: 'POST',
    body: JSON.stringify(entry),
  })
}

logger.addHandler(apiHandler)
```

### Set Log Level

```typescript
logger.setMinLevel(LogLevel.WARN) // Only output WARN and ERROR
```

### Usage in Bridge

```typescript
import { Logger } from 'message-nexus/utils/logger'

const logger = new Logger('MyBridge')
const nexus = new MessageNexus(driver, { logger })
```

## Design Highlights

### 1. Type Safety

MessageNexus uses TypeScript generics to provide full type inference:

```typescript
interface UserRequest {
  userId: number
}

interface UserResponse {
  id: number
  name: string
}

const nexus = new MessageNexus<UserRequest, UserResponse>(driver)

// Full type inference
const response = await nexus.request({
  method: 'GET_USER',
  params: { userId: 123 }, // Type: UserRequest
})

// response Type: UserResponse
console.log(response.name)
```

### 2. Memory Safety

- **Auto Cleanup**: Regularly clean up expired message records
- **Manual Cleanup**: Records are deleted immediately after `reply()`
- **Resource Release**: The `destroy()` method cleans up all timers and event listeners
- **Queue Limits**: The message queue has a maximum size limit to prevent infinite growth
- **Driver Lifecycle**: Each driver implements the `destroy()` method to correctly release resources
- **Emitter Isolation**: Recommended to use `createEmitter()` to create independent instances, avoiding memory leaks caused by shared singletons

### 3. Error Recovery

- **Auto Reconnect**: WebSocket automatic reconnection mechanism with exponential backoff strategy
- **Request Retry**: Automatic retry on request failure, configurable retry counts and delays
- **Message Queue**: Offline message caching, automatically sent after connection recovery
- **Error Callback**: Unified error handling mechanism

### 4. Security Hardening

- **PostMessage**: Prohibit using `'*'` as targetOrigin; the origin address must be explicitly specified
- **BroadcastChannel**: Use the protocol identifier `__messageBridge` to distinguish MessageNexus messages from user-defined messages
- **Message Validation**: Runtime validation of message format to prevent crashes from illegal messages
- **Source Filtering**: Automatically filters non-target messages

### 5. Observability

Built-in monitoring metrics for easy production environment monitoring:

```typescript
const metrics = nexus.getMetrics()

console.log(`Messages: ${metrics.messagesSent} sent, ${metrics.messagesReceived} received`)
console.log(
  `Success rate: ${((metrics.messagesReceived / metrics.messagesSent) * 100).toFixed(2)}%`,
)
console.log(`Avg latency: ${metrics.averageLatency}ms`)
console.log(`Pending: ${metrics.pendingMessages}, Queued: ${metrics.queuedMessages}`)
```

### 6. Structured Logging

Unified logging interface supporting multiple output methods:

```typescript
// Console output
logger.addHandler(createConsoleHandler())

// Send to API
logger.addHandler((entry) => {
  fetch('/api/logs', { body: JSON.stringify(entry) })
})

// Send to ELK
logger.addHandler((entry) => {
  elk.send(entry)
})
```

## Testing

Run unit tests:

```bash
cd packages/message-nexus
pnpm test:run
```

## License

MIT
