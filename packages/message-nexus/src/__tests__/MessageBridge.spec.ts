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

  describe('request', () => {
    it('should send request message with correct format', async () => {
      vi.useFakeTimers()
      const sendSpy = vi.spyOn(mockDriver, 'send')

      const promise = bridge.request({ method: 'TEST_ACTION', params: { data: 'test' } })

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

    it('should handle string request', async () => {
      vi.useFakeTimers()
      const sendSpy = vi.spyOn(mockDriver, 'send')

      const promise = bridge.request('TEST_ACTION')

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
      const promise = bridge.request({ method: 'TEST_ACTION', timeout: 100 })

      vi.advanceTimersByTime(100)

      await expect(promise).rejects.toThrow('Message timeout')
    })
  })

  describe('onCommand', () => {
    it('should register and call message handler', () => {
      const handler = vi.fn()

      const unregister = bridge.onCommand(handler)

      mockDriver.onMessage?.({
        from: 'sender',
        payload: {
          jsonrpc: '2.0',
          method: 'TEST_COMMAND',
          params: { data: 'test' },
          id: 'test-id',
        },
      } as any)

      expect(handler).toHaveBeenCalledWith({
        from: 'sender',
        payload: {
          jsonrpc: '2.0',
          method: 'TEST_COMMAND',
          params: { data: 'test' },
          id: 'test-id',
        },
      })

      unregister()
    })

    it('should allow unregistering handler', () => {
      const handler = vi.fn()

      const unregister = bridge.onCommand(handler)
      unregister()

      mockDriver.onMessage?.({
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

  describe('onNotify', () => {
    it('should register and call notification handler', () => {
      const handler = vi.fn()
      const unregister = bridge.onNotify(handler)

      mockDriver.onMessage?.({
        from: 'sender',
        payload: {
          jsonrpc: '2.0',
          method: 'TEST_NOTIFY',
          params: { data: 'test' },
        },
      } as any)

      expect(handler).toHaveBeenCalledWith({
        from: 'sender',
        payload: {
          jsonrpc: '2.0',
          method: 'TEST_NOTIFY',
          params: { data: 'test' },
        },
      })

      unregister()
    })

    it('should not call notification handler for command messages', () => {
      const handler = vi.fn()
      const unregister = bridge.onNotify(handler)

      mockDriver.onMessage?.({
        from: 'sender',
        payload: {
          jsonrpc: '2.0',
          method: 'TEST_COMMAND',
          params: { data: 'test' },
          id: 'test-id',
        },
      } as any)

      expect(handler).not.toHaveBeenCalled()

      unregister()
    })
  })

  describe('reply', () => {
    it('should send response message', () => {
      const sendSpy = vi.spyOn(mockDriver, 'send')

      mockDriver.onMessage?.({
        from: 'sender',
        payload: {
          jsonrpc: '2.0',
          method: 'TEST_COMMAND',
          params: { data: 'test' },
          id: 'test-id',
        },
      } as any)

      bridge.reply('test-id', { result: 'success' })

      expect(sendSpy).toHaveBeenCalledWith({
        from: bridge.instanceId,
        to: 'sender',
        payload: {
          jsonrpc: '2.0',
          id: 'test-id',
          result: { result: 'success' },
        },
      })
    })

    it('should throw error for unknown messageId', () => {
      expect(() => bridge.reply('unknown-id', { result: 'success' })).toThrow('Message not found')
    })
  })

  describe('request/response flow', () => {
    it('should complete request-response cycle', async () => {
      vi.useFakeTimers()
      const responsePayload = { result: 'success' }

      const sendSpy = vi.spyOn(mockDriver, 'send')
      const promise = bridge.request({ method: 'TEST_ACTION', params: { query: 'test' } })

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

      bridge.request('TEST_ACTION')

      expect(bridge['messageQueue'].length).toBeGreaterThan(0)
    })

    it('should flush queue when flushQueue is called', () => {
      vi.spyOn(mockDriver, 'send').mockImplementation(() => {
        throw new Error('Send failed')
      })

      bridge.request('TEST_ACTION')
      expect(bridge['messageQueue'].length).toBeGreaterThan(0)

      vi.spyOn(mockDriver, 'send').mockImplementation(() => {})
      bridge.flushQueue()

      expect(bridge['messageQueue'].length).toBe(0)
    })
  })

  describe('memory leak prevention', () => {
    it('should cleanup incomingMessages periodically', () => {
      mockDriver.onMessage?.({
        from: 'sender',
        payload: {
          jsonrpc: '2.0',
          method: 'TEST_COMMAND',
          id: 'test-id',
        },
      } as any)

      expect(bridge['incomingMessages'].has('test-id')).toBe(true)

      bridge.reply('test-id', { result: 'success' })

      expect(bridge['incomingMessages'].has('test-id')).toBe(false)
    })
  })

  describe('destroy', () => {
    it('should cleanup intervals', () => {
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval')

      bridge.destroy()

      expect(clearIntervalSpy).toHaveBeenCalled()
    })
  })
})
