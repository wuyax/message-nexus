import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import mitt from 'mitt'
import MessageNexus, { NexusError, NexusErrorCode } from '../index'
import MittDriver from '../drivers/MittDriver'
import BaseDriver from '../drivers/BaseDriver'
import { LogLevel } from '../utils/logger'

describe('MessageNexus', () => {
  let bridge: MessageNexus
  let mockDriver: MittDriver

  beforeEach(() => {
    vi.useFakeTimers()
    const emitter = mitt() as any
    mockDriver = new MittDriver(emitter)
    bridge = new MessageNexus(mockDriver)
  })

  afterEach(async () => {
    // We catch rejections because destroy() actively rejects all pending RPC tasks,
    // which can trigger unhandled rejections if the test didn't explicitly await them.
    try {
      bridge.destroy()
    } catch (e) {}
    
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('invoke', () => {
    it('should send invoke message with correct format', async () => {
      vi.useFakeTimers()
      const sendSpy = vi.spyOn(mockDriver, 'send')

      const promise = bridge.invoke({ method: 'TEST_ACTION', params: { data: 'test' } }).catch(() => {})
      await vi.advanceTimersByTimeAsync(0) // Wait for pipeline

      expect(sendSpy).toHaveBeenCalledWith({
        from: bridge.instanceId,
        to: undefined,
        metadata: { timestamp: expect.any(Number) },
        payload: {
          jsonrpc: '2.0',
          method: 'TEST_ACTION',
          params: { data: 'test' },
          id: expect.any(String),
        },
      })

      vi.advanceTimersByTime(bridge.timeout + 1000)

      await promise.catch(() => {})
    })

    it('should handle string invoke', async () => {
      vi.useFakeTimers()
      const sendSpy = vi.spyOn(mockDriver, 'send')

      const promise = bridge.invoke('TEST_ACTION').catch(() => {})
      await vi.advanceTimersByTimeAsync(0) // Wait for pipeline

      expect(sendSpy).toHaveBeenCalledWith({
        from: bridge.instanceId,
        to: undefined,
        metadata: { timestamp: expect.any(Number) },
        payload: {
          jsonrpc: '2.0',
          method: 'TEST_ACTION',
          params: undefined,
          id: expect.any(String),
        },
      })

      vi.advanceTimersByTime(bridge.timeout + 1000)

      await promise.catch(() => {})
    })

    it('should timeout after specified time', async () => {
      vi.useFakeTimers()
      vi.spyOn(mockDriver, 'send').mockImplementation(() => {})
      const promise = bridge.invoke({ method: 'TEST_ACTION', timeout: 100 })

      vi.advanceTimersByTime(100)

      await expect(promise).rejects.toThrow('Message timeout')
    })
  })

  describe('handle', () => {
    it('should register and call method handler and auto-reply', async () => {
      const handler = vi.fn().mockResolvedValue({ result: 'success' })
      const sendSpy = vi.spyOn(mockDriver, 'send')

      const unregister = bridge.handle('TEST_COMMAND', handler)

      await bridge._handleIncoming({
        from: 'sender',
        payload: {
          jsonrpc: '2.0',
          method: 'TEST_COMMAND',
          params: { data: 'test' },
          id: 'test-id',
        },
      } as any)

      expect(handler).toHaveBeenCalledWith(
        { data: 'test' },
        { messageId: 'test-id', from: 'sender', to: undefined, metadata: undefined },
      )

      expect(sendSpy).toHaveBeenCalledWith({
        from: bridge.instanceId,
        to: 'sender',
        payload: {
          jsonrpc: '2.0',
          id: 'test-id',
          result: { result: 'success' },
        },
      })

      unregister()
    })

    it('should reply with error if handler throws', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const sendSpy = vi.spyOn(mockDriver, 'send')

      bridge.handle('TEST_COMMAND', handler)

      await bridge._handleIncoming({
        from: 'sender',
        payload: {
          jsonrpc: '2.0',
          method: 'TEST_COMMAND',
          params: { data: 'test' },
          id: 'test-id',
        },
      } as any)

      expect(sendSpy).toHaveBeenCalledWith({
        from: bridge.instanceId,
        to: 'sender',
        payload: {
          jsonrpc: '2.0',
          id: 'test-id',
          error: {
            code: -32603,
            message: 'Handler failed',
            data: undefined,
            name: expect.any(String),
            stack: expect.any(String),
          },
        },
      })
    })

    it('should allow unregistering handler', async () => {
      const handler = vi.fn()

      const unregister = bridge.handle('TEST_COMMAND', handler)
      unregister()

      await bridge._handleIncoming({
        from: 'sender',
        payload: {
          jsonrpc: '2.0',
          method: 'TEST_COMMAND',
          params: { data: 'test' },
          id: 'test-id',
        },
      } as any)

      expect(handler).not.toHaveBeenCalled()
    })

    it('should reply with MethodNotFound when no handler exists', async () => {
      const sendSpy = vi.spyOn(mockDriver, 'send')

      await bridge._handleIncoming({
        from: 'sender',
        payload: {
          jsonrpc: '2.0',
          method: 'UNKNOWN_COMMAND',
          params: { data: 'test' },
          id: 'test-id',
        },
      } as any)

      expect(sendSpy).toHaveBeenCalledWith({
        from: bridge.instanceId,
        to: 'sender',
        payload: {
          jsonrpc: '2.0',
          id: 'test-id',
          error: {
            code: -32601,
            message: 'Method not found: UNKNOWN_COMMAND',
            data: undefined,
            name: expect.any(String),
            stack: expect.any(String),
          },
        },
      })
    })
  })

  describe('notify', () => {
    it('should send notification message with correct format', async () => {
      const sendSpy = vi.spyOn(mockDriver, 'send')

      await bridge.notify({ method: 'TEST_NOTIFY', params: { data: 'test' } })

      expect(sendSpy).toHaveBeenCalledWith({
        from: bridge.instanceId,
        to: undefined,
        metadata: { timestamp: expect.any(Number) },
        payload: {
          jsonrpc: '2.0',
          method: 'TEST_NOTIFY',
          params: { data: 'test' },
        },
      })
    })

    it('should handle string notification', async () => {
      const sendSpy = vi.spyOn(mockDriver, 'send')

      await bridge.notify('TEST_NOTIFY')

      expect(sendSpy).toHaveBeenCalledWith({
        from: bridge.instanceId,
        to: undefined,
        metadata: { timestamp: expect.any(Number) },
        payload: {
          jsonrpc: '2.0',
          method: 'TEST_NOTIFY',
          params: undefined,
        },
      })
    })
  })

  describe('onNotification', () => {
    it('should register and call notification handler', () => {
      const handler = vi.fn()
      const unregister = bridge.onNotification('TEST_NOTIFY', handler)

      mockDriver.onMessage?.({
        from: 'sender',
        payload: {
          jsonrpc: '2.0',
          method: 'TEST_NOTIFY',
          params: { data: 'test' },
        },
      } as any)

      expect(handler).toHaveBeenCalledWith(
        { data: 'test' },
        { from: 'sender', to: undefined, metadata: undefined },
      )

      unregister()
    })

    it('should not call notification handler for different methods', () => {
      const handler = vi.fn()
      const unregister = bridge.onNotification('TEST_NOTIFY', handler)

      mockDriver.onMessage?.({
        from: 'sender',
        payload: {
          jsonrpc: '2.0',
          method: 'OTHER_NOTIFY',
          params: { data: 'test' },
        },
      } as any)

      expect(handler).not.toHaveBeenCalled()

      unregister()
    })
  })

  describe('invoke/response flow', () => {
    it('should complete invoke-response cycle', async () => {
      vi.useFakeTimers()
      const responsePayload = { result: 'success' }

      vi.spyOn(mockDriver, 'send').mockImplementation(() => {})
      const promise = bridge.invoke({ method: 'TEST_ACTION', params: { query: 'test' } })

      await vi.advanceTimersByTimeAsync(0) // Wait for pipeline

      const id = (bridge as any).scheduler.pendingTasks.keys().next().value
      if (!id) {
        throw new Error('Message not sent')
      }

      mockDriver.onMessage?.({
        from: 'receiver',
        payload: {
          jsonrpc: '2.0',
          id,
          result: responsePayload,
        },
      } as any)

      vi.advanceTimersByTime(10)

      await expect(promise).resolves.toEqual(responsePayload)
    })
  })

  describe('message validation', () => {
    it('should reject invalid message format', () => {
      const errorHandler = vi.fn()
      bridge.onError(errorHandler)

      mockDriver.onMessage?.({ invalid: 'message' } as any)

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error), expect.any(Object))
    })

    it('should reject message without jsonrpc payload', () => {
      const errorHandler = vi.fn()
      bridge.onError(errorHandler)

      mockDriver.onMessage?.({ from: 'sender', payload: { method: 'TEST' } } as any)

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error), expect.any(Object))
    })

    it('should reject message without method or result/error', () => {
      const errorHandler = vi.fn()
      bridge.onError(errorHandler)

      mockDriver.onMessage?.({ from: 'sender', payload: { jsonrpc: '2.0', id: 'test' } } as any)

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error), expect.any(Object))
    })

    it('should unregister error handler', () => {
      const errorHandler = vi.fn()
      const unsubscribe = bridge.onError(errorHandler)
      
      unsubscribe()
      
      mockDriver.onMessage?.({ invalid: 'message' } as any)
      expect(errorHandler).not.toHaveBeenCalled()
    })
  })

  describe('message queue', () => {
    it('should queue messages when driver send fails', async () => {
      vi.spyOn(mockDriver, 'send').mockImplementation(() => {
        throw new Error('Send failed')
      })

      bridge.invoke('TEST_ACTION').catch(() => {})
      await vi.advanceTimersByTimeAsync(0) // Wait for pipeline

      expect(bridge.getQueueLength()).toBeGreaterThan(0)
    })

    it('should flush queue when flushQueue is called', async () => {
      vi.spyOn(mockDriver, 'send').mockImplementation(() => {
        throw new Error('Send failed')
      })

      bridge.invoke('TEST_ACTION').catch(() => {})
      await vi.advanceTimersByTimeAsync(0) // Wait for pipeline
      expect(bridge.getQueueLength()).toBeGreaterThan(0)

      vi.spyOn(mockDriver, 'send').mockImplementation(() => {})
      bridge.flushQueue()

      expect(bridge.getQueueLength()).toBe(0)
    })
  })

  describe('Connection Recovery', () => {
    it('should automatically flush queue when driver connects', async () => {
      const mockDriver = new BaseDriver()
      const sendSpy = vi.spyOn(mockDriver, 'send').mockImplementation(() => {
        throw new Error('Offline')
      })
      
      const nexus = new MessageNexus(mockDriver)
      
      // Send a notification, which should fail and enter the queue
      await nexus.notify('TEST_NOTIFY', { data: 1 })
      
      // Verify it's in the queue
      expect(nexus.getMetrics().queuedMessages).toBe(1)
      
      // Simulate connection recovery by mocking send to succeed
      sendSpy.mockImplementation(() => {})
      
      // Trigger the onConnect hook
      mockDriver.onConnect?.()
      
      // Verify queue is flushed
      expect(nexus.getMetrics().queuedMessages).toBe(0)
      expect(sendSpy).toHaveBeenCalledTimes(2) // Once failed, once recovered
      
      nexus.destroy()
    })
  })

  describe('Invoke Retries and Queue', () => {
    it('should not enqueue the message multiple times during invoke retries', async () => {
      vi.useFakeTimers()
      
      const mockDriver = new BaseDriver()
      const sendSpy = vi.spyOn(mockDriver, 'send').mockImplementation(() => {
        throw new Error('Send failed')
      })
      
      const nexus = new MessageNexus(mockDriver)
      
      // Invoke with 2 retries (total 3 attempts)
      const invokePromise = nexus.invoke({
        method: 'TEST_METHOD',
        retryCount: 2,
        retryDelay: 100,
        timeout: 5000
      }).catch(() => {}) // Catch expected failure
      
      await vi.advanceTimersByTimeAsync(0) // Wait for pipeline
      
      // Advance timers to trigger all retries
      await vi.runAllTimersAsync()
      await invokePromise
      
      // It should have attempted to send 3 times
      expect(sendSpy).toHaveBeenCalledTimes(3)
      
      // But it should only be in the queue ONCE
      expect(nexus.getMetrics().queuedMessages).toBe(1)
      
      nexus.destroy()
      vi.useRealTimers()
    })
  })

  describe('Logger and Metrics', () => {
    it('should use provided SimpleLogger', async () => {
      // Must not have addHandler etc., otherwise it qualifies as a full LoggerInterface
      const mockSimpleLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }
      const bridgeWithLogger = new MessageNexus(mockDriver, {
        logger: mockSimpleLogger as any,
        loggerEnabled: true,
        logLevel: LogLevel.DEBUG, // Set to DEBUG so we can test debug call
      })
      
      expect(mockSimpleLogger.info).toHaveBeenCalled()
      
      // Trigger a log
      await bridgeWithLogger.notify('TEST')
      expect(mockSimpleLogger.debug).toHaveBeenCalled()
      
      // Trigger warn and error to cover those branches
      bridgeWithLogger['logger'].warn('warning')
      bridgeWithLogger['logger'].error('error')
      expect(mockSimpleLogger.warn).toHaveBeenCalled()
      expect(mockSimpleLogger.error).toHaveBeenCalled()
    })

    it('should use provided full LoggerInterface', () => {
      const mockFullLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        enable: vi.fn(),
        disable: vi.fn(),
        setLogLevel: vi.fn(),
        addHandler: vi.fn(),
        isEnabled: vi.fn().mockReturnValue(true),
        setMinLevel: vi.fn(),
      }
      const bridgeWithFullLogger = new MessageNexus(mockDriver, {
        logger: mockFullLogger as any,
        loggerEnabled: true,
      })
      
      expect(bridgeWithFullLogger['logger']).toBe(mockFullLogger)
    })

    it('should use console handler when loggerEnabled is true and no logger provided', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const bridgeWithConsole = new MessageNexus(mockDriver, {
        loggerEnabled: true,
      })
      // Should log initialization with INFO
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should notify metrics changes', async () => {
      const callback = vi.fn()
      const unsubscribe = bridge.onMetrics(callback)
      
      await bridge.notify('TEST_NOTIFY')
      vi.advanceTimersByTime(150)
      expect(callback).toHaveBeenCalled()
      unsubscribe()
      
      callback.mockClear()
      await bridge.notify('TEST_NOTIFY_2')
      // Should not be called again as we unsubscribed
      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('Queue edge cases', () => {
    it('should drop oldest message when queue is full', async () => {
      const bridgeSmallQueue = new MessageNexus(mockDriver)
      // Force queue size limit to be 2 for testing
      bridgeSmallQueue['queue']['maxQueueSize'] = 2
      vi.spyOn(mockDriver, 'send').mockImplementation(() => {
        throw new Error('Send failed')
      })

      await bridgeSmallQueue.notify('MSG_1')
      await bridgeSmallQueue.notify('MSG_2')
      await bridgeSmallQueue.notify('MSG_3')

      expect(bridgeSmallQueue.getQueueLength()).toBe(2)
      // The first message (MSG_1) should be dropped
      const queueSnapshot = bridgeSmallQueue.getQueueSnapshot()
      expect((queueSnapshot[0].payload as any).method).toBe('MSG_2')
      expect((queueSnapshot[1].payload as any).method).toBe('MSG_3')
    })

    it('should handle flushQueue failure', async () => {
      vi.spyOn(mockDriver, 'send').mockImplementation(() => {
        throw new Error('Send failed')
      })
      await bridge.notify('TEST_NOTIFY') // Queues 1 message
      
      // Now mock it to fail on the flush too
      const mockError = new Error('Flush send failed')
      vi.spyOn(mockDriver, 'send').mockImplementationOnce(() => {
        throw mockError
      })
      
      bridge.flushQueue()
      
      // Should still be in the queue
      expect(bridge.getQueueLength()).toBe(1)
    })
  })

  describe('Handler edge cases', () => {
    it('should catch error thrown in notification handler', () => {
      const handler = vi.fn().mockImplementation(() => {
        throw new Error('Notification handler error')
      })
      bridge.onNotification('TEST_NOTIFY', handler)
      
      // Trigger notification reception
      mockDriver.onMessage?.({
        from: 'sender',
        payload: {
          jsonrpc: '2.0',
          method: 'TEST_NOTIFY',
        },
      } as any)
      
      // Error shouldn't bubble up, but should be logged (caught internally)
      expect(handler).toHaveBeenCalled()
    })

    it('should warn when overriding handler and allow removal', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      
      bridge.handle('TEST_OVERRIDE', handler1)
      bridge.handle('TEST_OVERRIDE', handler2) // Should trigger warn log
      
      expect(bridge.hasHandler('TEST_OVERRIDE')).toBe(true)
      
      bridge.removeHandler('TEST_OVERRIDE')
      expect(bridge.hasHandler('TEST_OVERRIDE')).toBe(false)
    })

    it('should handle offNotification edge cases', () => {
      const handler = vi.fn()
      const handler2 = vi.fn()
      
      bridge.onNotification('TEST_NOTIFY', handler)
      bridge.onNotification('TEST_NOTIFY', handler2)
      
      // Remove one handler
      bridge.offNotification('TEST_NOTIFY', handler)
      expect(bridge.getNotificationMethodsCount()).toBe(1)
      
      // Remove last handler, size is 0, should delete the set
      bridge.offNotification('TEST_NOTIFY', handler2)
      expect(bridge.getNotificationMethodsCount()).toBe(0)
      
      // Off on non-existent
      bridge.offNotification('NON_EXISTENT', handler)
    })
  })

  describe('Response edge cases', () => {
    it('should log warning for orphaned response', () => {
      mockDriver.onMessage?.({
        from: 'receiver',
        payload: {
          jsonrpc: '2.0',
          id: 'unknown-id',
          result: { data: 'test' },
        },
      } as any)
      // Just verifying it doesn't throw and handles it gracefully
    })

    it('should reject promise when response contains error', async () => {
      vi.useFakeTimers()
      vi.spyOn(mockDriver, 'send').mockImplementation(() => {})
      const promise = bridge.invoke('TEST_ACTION')
      
      await vi.advanceTimersByTimeAsync(0) // Wait for pipeline
      
      const id = (bridge as any).scheduler.pendingTasks.keys().next().value
      
      mockDriver.onMessage?.({
        from: 'receiver',
        payload: {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: 'Error from remote',
          },
        },
      } as any)
      
      await expect(promise).rejects.toThrow('Error from remote')
    })
  })
})

describe('Error Handling', () => {
  it('should preserve error name and stack in NexusError', () => {
    const originalError = new Error('Test Original Error')
    const nexusError = new NexusError(originalError.message, NexusErrorCode.InternalError, undefined, originalError.name, originalError.stack)
    
    expect(nexusError.name).toBe('Error')
    expect(nexusError.stack).toBe(originalError.stack)
  })

  it('should serialize and deserialize error name and stack across the bridge', async () => {
    const emitter = mitt() as any
    const driver1 = new MittDriver(emitter)
    const driver2 = new MittDriver(emitter)
    
    const bridge1 = new MessageNexus(driver1, { instanceId: 'bridge1' })
    const bridge2 = new MessageNexus(driver2, { instanceId: 'bridge2' })
    
    const testError = new TypeError('Something went wrong')
    
    bridge2.handle('THROW_ERROR', async () => {
      throw testError
    })
    
    try {
      await bridge1.invoke({ method: 'THROW_ERROR', to: 'bridge2' })
      expect.fail('Should have thrown')
    } catch (error: any) {
      expect(error).toBeInstanceOf(NexusError)
      expect(error.name).toBe('TypeError')
      expect(error.message).toBe('Something went wrong')
      expect(error.stack).toBe(testError.stack)
      expect(error.code).toBe(NexusErrorCode.InternalError)
    }
    
    bridge1.destroy()
    bridge2.destroy()
  })
})

describe('Queue Management', () => {
  class MockDriver extends BaseDriver {
    send = vi.fn()
  }

  it('should discard messages causing DataCloneError and continue processing queue', async () => {
    const driver = new MockDriver()
    const nexus = new MessageNexus(driver, { loggerEnabled: false })
    
    const cloneError = new NexusError('Message payload cannot be cloned', NexusErrorCode.InvalidParams)
    const normalError = new Error('Network offline')
    
    // Setup driver to fail first with clone error, then network error, then succeed
    driver.send.mockImplementationOnce(() => { throw cloneError })
               .mockImplementationOnce(() => { throw normalError })
               .mockImplementationOnce(() => {})
               
    await nexus.notify({ method: 'test1' }) // Will throw clone error, should be discarded
    await nexus.notify({ method: 'test2' }) // Will throw normal error, should queue
    
    expect(nexus.getMetrics().queuedMessages).toBe(1)
    
    // Restore driver
    driver.send.mockImplementation(() => {})
    nexus.flushQueue() // Should process the queued message
    
    expect(nexus.getMetrics().queuedMessages).toBe(0)
    expect(driver.send).toHaveBeenCalledTimes(3)
  })
})

describe('Interceptors', () => {
  class MockDriver extends BaseDriver {
    send = vi.fn()
  }

  it('should allow intercepting outgoing messages', async () => {
    const driver = new MockDriver()
    const nexus = new MessageNexus(driver, { loggerEnabled: false })
    
    nexus.useRequestInterceptor((msg) => {
      msg.metadata = { ...msg.metadata, injected: true }
      return msg
    })
    
    await nexus.notify({ method: 'test' })
    
    expect(driver.send).toHaveBeenCalled()
    const sentMsg = driver.send.mock.calls[0][0]
    expect(sentMsg.metadata.injected).toBe(true)
  })
  
  it('should allow intercepting incoming messages', async () => {
    const driver = new MockDriver()
    const nexus = new MessageNexus(driver, { loggerEnabled: false })
    
    let interceptedParams: any
    nexus.useResponseInterceptor((msg) => {
      if ('method' in msg.payload && msg.payload.method === 'test') {
         msg.payload.params = { modified: true }
      }
      return msg
    })
    
    nexus.onNotification('test', (params) => {
      interceptedParams = params
    })
    
    await nexus._handleIncoming({
      from: 'remote',
      payload: { jsonrpc: '2.0', method: 'test', params: { original: true } }
    })
    
    expect(interceptedParams).toEqual({ modified: true })
  })

  it('should allow intercepting RPC replies', async () => {
    const driver = new MockDriver()
    const nexus = new MessageNexus(driver, { loggerEnabled: false })
    
    nexus.handle('sum', (params: any) => params.a + params.b)
    
    nexus.useRequestInterceptor((msg) => {
      if ('result' in msg.payload) {
        msg.payload.result = (msg.payload.result as number) * 10
      }
      return msg
    })
    
    await nexus._handleIncoming({
      from: 'caller',
      payload: { jsonrpc: '2.0', method: 'sum', params: { a: 1, b: 2 }, id: '1' }
    })
    
    // Check what was sent back
    expect(driver.send).toHaveBeenCalled()
    const reply = driver.send.mock.calls[0][0]
    expect(reply.payload.result).toBe(30) // (1+2) * 10
  })

  it('should handle interceptor failures gracefully', async () => {
    const driver = new MockDriver()
    const nexus = new MessageNexus(driver, { loggerEnabled: false })
    const errorHandler = vi.fn()
    nexus.onError(errorHandler)
    
    nexus.useRequestInterceptor(() => {
      throw new Error('Interceptor failed')
    })
    
    await nexus.notify({ method: 'test' })
    
    expect(driver.send).not.toHaveBeenCalled()
    expect(nexus.getMetrics().messagesFailed).toBe(1)
    expect(errorHandler).toHaveBeenCalled()
  })
})
