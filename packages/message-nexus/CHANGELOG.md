# message-nexus

## 1.3.0 (2026-07-16)

### 🚀 New Features
- **Selective Event Clearing (`clearHandlers`)**:
  - Added `nexus.clearHandlers(type?: 'invoke' | 'notification' | 'all')` to allow clearing RPC/Invoke handlers and/or Notification listeners without destroying the instance or dropping connections.
- **Public Inspection & Statistics APIs**:
  - Introduced `getHandlersCount()`, `getNotificationMethodsCount()`, `getQueueLength()`, `getQueueSnapshot()`, and `getPendingTasksCount()` to monitor internal states in a type-safe manner.

### 🛠️ Refactoring & Performance
  - **Architectural Decoupling**:
    - Decoupled `MessageNexus` into dedicated core classes: `MessageQueue` (buffer queue), `RpcScheduler` (timeout and response routing), and `EventRouter` (message verification).
- **Koa-style Middleware Pipeline**:
  - Replaced simple array interceptors with an asynchronous Koa-style middleware pipeline (`MiddlewarePipeline`) to handle request and response modifications cleanly.
- **Harden Runtime Safety**:
  - Enforced strict JSON-RPC 2.0 runtime compliance check in `EventRouter`.
  - Added defensive execution wrappers for user callbacks (metrics, errors, interceptors) to prevent pipeline crashes.
  - Correctly rejects pending RPC tasks with the `InstanceDestroyed` error code on instance destruction.

## 1.2.0

### Minor Changes

- Extensibility: Introduced a powerful interceptor mechanism. Users can now register RequestInterceptor and ResponseInterceptor hooks to modify

## 1.1.4

### Patch Changes

- Improve system stability

## 1.1.3

### Patch Changes

- enhancements logs and error handle

## 1.1.2

### Patch Changes

- add logging capabilities

## 1.1.1

### Patch Changes

- update event handling in MittDriver to use EventType for better type safety
