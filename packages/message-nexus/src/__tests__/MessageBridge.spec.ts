import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import mitt from 'mitt'
import MessageNexus from '../index'
import MittDriver from '../drivers/MittDriver'

describe('MessageNexus', () => {
  let bridge: MessageNexus
  let mockDriver: MittDriver

  beforeEach(() => {
    vi.useFakeTimers()
    const emitter = mitt() as any
    mockDriver = new MittDriver(emitter)
    bridge = new MessageNexus(mockDriver)
  })

  afterEach(() => {
    bridge.destroy()
    vi.restoreAllMocks()
  })

  describe('invoke', () => {
    it('should send invoke message with correct format', async () => {
      vi.useFakeTimers()
      const sendSpy = vi.spyOn(mockDriver, 'send')

      const promise = bridge.invoke({ method: 'TEST_ACTION', params: { data: 'test' } })

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

      const promise = bridge.invoke('TEST_ACTION')

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
            code: -32000,
            message: 'Handler failed',
            data: undefined,
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
          },
        },
      })
    })
  })

  describe('notify', () => {
    it('should send notification message with correct format', () => {
      const sendSpy = vi.spyOn(mockDriver, 'send')

      bridge.notify({ method: 'TEST_NOTIFY', params: { data: 'test' } })

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

    it('should handle string notification', () => {
      const sendSpy = vi.spyOn(mockDriver, 'send')

      bridge.notify('TEST_NOTIFY')

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

      vi.advanceTimersByTime(0)

      const id = Array.from(bridge.pendingTasks.keys())[0]
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
  })

  describe('message queue', () => {
    it('should queue messages when driver send fails', () => {
      vi.spyOn(mockDriver, 'send').mockImplementation(() => {
        throw new Error('Send failed')
      })

      bridge.invoke('TEST_ACTION')

      expect(bridge['messageQueue'].length).toBeGreaterThan(0)
    })

    it('should flush queue when flushQueue is called', () => {
      vi.spyOn(mockDriver, 'send').mockImplementation(() => {
        throw new Error('Send failed')
      })

      bridge.invoke('TEST_ACTION')
      expect(bridge['messageQueue'].length).toBeGreaterThan(0)

      vi.spyOn(mockDriver, 'send').mockImplementation(() => {})
      bridge.flushQueue()

      expect(bridge['messageQueue'].length).toBe(0)
    })
  })
})
