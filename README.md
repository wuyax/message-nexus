# MessageNexus Monorepo

A unified, type-safe cross-context message communication library supporting multiple transport protocols.

## Monorepo Structure

This is a monorepo project using pnpm workspaces, containing the following packages:

- **`packages/message-nexus`**: Core npm package
- **`packages/example`**: Vue3 example application for validation and demonstration

## Quick Start

### Install Dependencies

```bash
pnpm install
```

### Development

Start the Vue3 example application (Hot Module Replacement):

```bash
pnpm dev
```

### Build

Build all packages:

```bash
pnpm build
```

Build the core package only:

```bash
pnpm build:core
```

Build the example application only:

```bash
pnpm build:example
```

### Test

Run tests (watch mode):

```bash
pnpm test
```

Run tests (single run):

```bash
pnpm test:run
```

### Type Check

```bash
pnpm type-check
```

### Format Code

```bash
pnpm lint
```

## message-nexus

Core message communication library, supporting the following features:

- **Unified Interface**: Supports Mitt (in-process), PostMessage (iframe/window), BroadcastChannel (cross-tab), and WebSocket (network communication)
- **Type Safety**: Full TypeScript support with generic type inference
- **Request-Response Pattern**: Promise-style asynchronous communication with built-in timeout protection
- **Auto Reconnect**: WebSocket automatic reconnection mechanism with exponential backoff support
- **Message Queue**: Offline message caching, automatically sent after connection recovery
- **Retry Mechanism**: Automatic retry on request failure, configurable retry counts and delays
- **Message Validation**: Runtime message format validation to prevent illegal messages
- **Monitoring Metrics**: Built-in message statistics and performance monitoring
- **Structured Logging**: Supports custom log handlers for easy debugging and production monitoring

### Usage Example

```typescript
import { createEmitter, MittDriver, MessageNexus } from 'message-nexus'

// Create an independent emitter instance using the factory function
const emitter = createEmitter()
const driver = new MittDriver(emitter)
const nexus = new MessageNexus(driver)

// Send request
const response = await nexus.request({
  type: 'GET_DATA',
  payload: { id: 123 },
})

// Listen for commands
const unsubscribe = nexus.onCommand((data) => {
  if (data.type === 'GET_DATA') {
    nexus.reply(data.id, { name: 'test', value: 42 })
  }
})

// Clean up resources (Important!)
nexus.destroy()
```

For detailed API documentation, please refer to [packages/message-nexus](./packages/message-nexus/README.md).

### Example Application

The Vue3 example application includes the following demo pages:

| Route          | Demo Content                                          |
| -------------- | ----------------------------------------------------- |
| `/`            | MittDriver - In-process communication                 |
| `/postmessage` | PostMessageDriver - Cross-window/iframe communication |
| `/broadcast`   | BroadcastDriver - Cross-tab communication             |

Run the example:

```bash
pnpm dev
```

Then visit http://localhost:5173

## Workspace Commands

In the monorepo root, you can use the following commands to perform actions on specific workspaces:

```bash
# Run command in the message-nexus package
pnpm --filter message-nexus <command>

# Run command in the example package
pnpm --filter @message-nexus/example <command>

# Run command in all packages
pnpm --filter ./packages/** <command>
```

## Publish Process

### 1. Update Version

```bash
pnpm --filter message-nexus version <major|minor|patch>
```

### 2. Build Package

```bash
pnpm build:core
```

### 3. Publish to npm

```bash
pnpm --filter message-nexus publish
```

## License

MIT
