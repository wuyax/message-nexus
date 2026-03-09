# @message-nexus/server

A simple Node.js WebSocket server for testing the message-nexus WebSocket driver.

## Features

- **WebSocket Support**: Lightweight WebSocket service implemented based on the `ws` library.
- **Message Broadcasting**: Automatically broadcasts received messages to all other connected clients (used to simulate cross-client communication).
- **Simple and Easy to Use**: Zero-configuration startup, supports port configuration via environment variables.
- **Graceful Shutdown**: Supports SIGINT signal handling to ensure connections are safely closed.

## Quick Start

### Install Dependencies

Run in the project root directory:

```bash
pnpm install
```

### Start Service

```bash
pnpm dev:ws
```

Starts on port `8080` by default.

### Configure Port

Port can be customized via the `WS_PORT` environment variable:

```bash
WS_PORT=9000 pnpm dev:ws
```

## Usage in MessageNexus

Use with the `WebSocketDriver` from `message-nexus`:

```typescript
import { MessageNexus, WebSocketDriver } from 'message-nexus'

const driver = new WebSocketDriver('ws://localhost:8080')
const nexus = new MessageNexus(driver)

// Communicate once the connection is successful
```

## Development and Debugging

The server outputs connection and message logs after starting, facilitating the debugging of the `WebSocketDriver`'s connection, reconnection, and message transmission mechanisms.

```bash
[2026-02-27T08:39:35.000Z] WebSocket server starting on port 8080...
[2026-02-27T08:39:35.000Z] WebSocket server running
[2026-02-27T08:39:35.000Z] Connect with: ws://localhost:8080
```
