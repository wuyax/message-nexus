# AGENTS.md - MessageNexus Development Guide

This file provides guidelines for AI agents working on the MessageNexus codebase.

## Build, Lint, and Test Commands

### Root Level Commands (run from monorepo root)

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Build specific package
pnpm build:core      # Core library only
pnpm build:example   # Vue example only

# Run tests
pnpm test            # Watch mode (vitest)
pnpm test:run        # Single test run

# Run tests for specific package
pnpm --filter message-nexus test
pnpm --filter message-nexus test:run

# Type check
pnpm type-check

# Format code
pnpm lint            # Uses prettier

# Clean build artifacts
pnpm clean
```

### Single Test Execution

Run a single test file:

```bash
cd packages/message-nexus && pnpm test:run -- src/__tests__/drivers/BroadcastDriver.spec.ts
```

Run a specific test within a file:

```bash
cd packages/message-nexus && pnpm test:run -- -t "should timeout after specified time"
```

## Code Style Guidelines

### TypeScript Configuration

- Target: ES2020
- Module: ESNext with bundler resolution
- Strict mode: enabled
- Declaration files: generated

### Imports and Exports

```typescript
// Default export for main classes
export default class MessageNexus { }

// Named exports for types and utilities
export interface CommandMessage { }
export type ErrorHandler = ...

// Group related exports
export { BaseDriver, MittDriver, PostMessageDriver, WebSocketDriver, emitter }
export type { MessageNexusOptions, RequestOptions, Message }
```

### Naming Conventions

| Pattern         | Convention               | Example                       |
| --------------- | ------------------------ | ----------------------------- |
| Classes         | PascalCase               | `MessageNexus`, `BaseDriver` |
| Interfaces      | PascalCase               | `MessageNexusOptions`        |
| Types           | PascalCase               | `ErrorHandler`                |
| Enums           | PascalCase               | `LogLevel`                    |
| Private members | camelCase with `private` | `private cleanupInterval`     |
| Methods         | camelCase                | `onCommand`, `getMetrics`     |
| Constants       | UPPER_SNAKE_CASE         | `LOG_LEVEL_DEBUG`             |
| Files           | kebab-case               | `web-socket-driver.ts`        |

### Formatting (Prettier)

- Single quotes: `true`
- Semicolons: `false`
- Print width: 100

### Error Handling

```typescript
// Always use try/catch for synchronous operations
try {
  this.driver.send(message)
} catch (error) {
  // Convert to Error instance
  const err = error instanceof Error ? error : new Error(String(error))
  this.metrics.messagesFailed++
  this.logger.error('Failed to send message', { error: err.message })
  this.errorHandler?.(err, { message })
}

// Use optional chaining and nullish coalescing
this.timeout = options?.timeout ?? 10000
this.logger = options?.logger || new Logger('MessageNexus')
```

### Type Safety

- Never use `any`, `@ts-ignore`, or type assertions to suppress errors
- Use `unknown` for truly unknown types
- Use type guards for runtime validation
- Use `Record<string, unknown>` for flexible metadata objects

### Class Structure

```typescript
export default class ExampleClass {
  // Public properties
  driver: BaseDriver

  // Private properties with type annotations
  private cleanupInterval: ReturnType<typeof setInterval> | null = null
  private messageQueue: Message[] = []
  private maxQueueSize: number = 100

  // Constructor
  constructor(driver: BaseDriver, options?: Options) {
    // Initialize
  }

  // Public methods
  publicMethod() {}

  // Private methods with _ prefix convention
  private _internalMethod() {}
}
```

### Testing (Vitest)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('MessageNexus', () => {
  let nexus: MessageNexus

  beforeEach(() => {
    vi.useFakeTimers()
    // Setup
  })

  afterEach(() => {
    nexus.destroy()
    vi.restoreAllMocks()
  })

  it('should do something', () => {
    expect(result).toBe(expected)
  })
})
```

### Driver Pattern

All drivers extend `BaseDriver` and implement:

```typescript
export default class BaseDriver {
  onMessage: ((data: Message) => void) | null

  constructor() {
    this.onMessage = null
  }

  send(data: Message) {
    throw new Error('Not implemented')
  }
}
```

### Logging Pattern

Use the built-in Logger with structured logging:

```typescript
import { Logger, createConsoleHandler, LogLevel } from './utils/logger'

const logger = new Logger('ContextName', LogLevel.DEBUG)
logger.addHandler(createConsoleHandler())

logger.debug('Message sent', { messageId: id, type })
logger.info('Operation completed', { duration })
logger.warn('Queue full, dropping oldest', { queueSize })
logger.error('Send failed', { error: err.message })
```

## Project Structure

```
message-nexus/
├── packages/
│   ├── message-nexus/     # Core library
│   │   ├── src/
│   │   │   ├── drivers/    # Driver implementations
│   │   │   ├── utils/      # Utilities (logger, emitter)
│   │   │   └── __tests__/  # Test files
│   │   └── dist/           # Built output
│   └── example/            # Vue3 demo app
├── pnpm-workspace.yaml     # Workspace config
└── package.json           # Root scripts
```

## Key Dependencies

- **mitt**: Event emitter for in-process communication
- **vitest**: Testing framework
- **tsup**: Build tool (ESM + CJS)
- **typescript**: Language

## Node.js Requirements

- Node.js: `^20.19.0 || >=22.12.0`
- pnpm: `>=10.0.0`
