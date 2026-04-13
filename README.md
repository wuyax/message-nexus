# MessageNexus Monorepo

A unified, type-safe cross-context message communication library supporting multiple transport protocols.

## Monorepo Structure

This project uses pnpm workspaces and contains the following packages:

- **`packages/message-nexus`**: Core communication library (the main npm package).
- **`packages/task-scheduler`**: Performance-optimized task scheduler for Three.js 3D scenes.
- **`packages/example`**: Vue3 application demonstrating and validating all transport drivers.
- **`packages/server`**: Node.js WebSocket server for testing network communication.

## Quick Start

### Install Dependencies

```bash
pnpm install
```

### Development

Start the Vue3 example application:
```bash
pnpm dev
```

Start the WebSocket test server:
```bash
pnpm dev:ws
```

### Build

Build all packages:
```bash
pnpm build
```

Build only core libraries (`message-nexus` & `task-scheduler`):
```bash
pnpm build:deps
```

### Test

Run `message-nexus` tests (watch mode):
```bash
pnpm test
```

Run `message-nexus` tests (single run):
```bash
pnpm test:run
```

Run `task-scheduler` tests:
```bash
pnpm test:task-scheduler
```

### Maintenance

```bash
# Type check core library
pnpm type-check

# Format code across all packages
pnpm lint

# Clean all build artifacts and node_modules
pnpm clean
```

## Features

### message-nexus

- **Multi-Protocol**: Unified API for Mitt, PostMessage, BroadcastChannel, and WebSocket.
- **JSON-RPC 2.0**: Standardized communication protocol.
- **Type Safety**: End-to-end TypeScript support.
- **Reliability**: Auto-reconnect, message queuing, and retry mechanisms.
- **Monitoring**: Built-in metrics and structured logging.

### task-scheduler

- **3D Optimization**: Designed specifically for Three.js frame-budget management.
- **Smart Scheduling**: Prioritize and throttle tasks to maintain high FPS.

## Publish Process

We use [Changesets](https://github.com/changesets/changesets) for versioning and publishing.

### 1. Generate Changeset
```bash
pnpm changeset
```
Follow prompts to select packages and set the version bump level.

### 2. Update Versions
```bash
pnpm version-packages
```

### 3. Build & Publish
```bash
pnpm release
```

## License

MIT
