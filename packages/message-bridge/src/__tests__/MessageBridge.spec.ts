import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import mitt from 'mitt'
import MessageBridge from '../index'
import MittDriver from '../drivers/MittDriver'

describe('MessageBridge', () => {
  let bridge: MessageBridge
  let mockDriver: MittDriver

  beforeEach(() => {
    vi.useFakeTimers()
    const emitter = mitt() as any
    mockDriver = new MittDriver(emitter)
    bridge = new MessageBridge(mockDriver)
  })

  afterEach(() => {
    bridge.destroy()
    vi.restoreAllMocks()
  })

  describe('request', () => {
    it('should send request message with correct format', async () => {
      vi.useFakeTimers()
      const sendSpy = vi.spyOn(mockDriver, 'send')

      const promise = bridge.request({ type: 'TEST_ACTION', payload: { data: 'test' } })

      expect(sendSpy).toHaveBeenCalledWith({
        id: expect.any(String),
        type: 'TEST_ACTION',
        payload: { data: 'test' },
        from: bridge.instanceId,
        to: undefined,
        metadata: { timestamp: expect.any(Number) },
      })

      vi.advanceTimersByTime(bridge.timeout + 1000)

      await promise.catch(() => {})
    })

    it('should handle string request', async () => {
      vi.useFakeTimers()
      const sendSpy = vi.spyOn(mockDriver, 'send')

      const promise = bridge.request('TEST_ACTION')

      expect(sendSpy).toHaveBeenCalledWith({
        id: expect.any(String),
        type: 'TEST_ACTION',
        payload: undefined,
        from: bridge.instanceId,
        to: undefined,
        metadata: { timestamp: expect.any(Number) },
      })

      vi.advanceTimersByTime(bridge.timeout + 1000)

      await promise.catch(() => {})
    })

    it('should timeout after specified time', async () => {
      vi.useFakeTimers()
      const promise = bridge.request({ type: 'TEST_ACTION', timeout: 100 })

      vi.advanceTimersByTime(100)

      await expect(promise).rejects.toThrow('Message timeout')
    })
  })

  describe('onCommand', () => {
    it('should register and call message handler', () => {
      const handler = vi.fn()

      const unregister = bridge.onCommand(handler)

      mockDriver.onMessage?.({
        id: 'test-id',
        type: 'TEST_COMMAND',
        payload: { data: 'test' },
        from: 'sender',
      })

      expect(handler).toHaveBeenCalledWith({
        id: 'test-id',
        type: 'TEST_COMMAND',
        payload: { data: 'test' },
        from: 'sender',
      })

      unregister()
    })

    it('should allow unregistering handler', () => {
      const handler = vi.fn()

      const unregister = bridge.onCommand(handler)
      unregister()

      mockDriver.onMessage?.({
        id: 'test-id',
        type: 'TEST_COMMAND',
        payload: { data: 'test' },
        from: 'sender',
      })

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('reply', () => {
    it('should send response message', () => {
      const sendSpy = vi.spyOn(mockDriver, 'send')

      mockDriver.onMessage?.({
        id: 'test-id',
        type: 'TEST_COMMAND',
        payload: { data: 'test' },
        from: 'sender',
      })

      bridge.reply('test-id', { result: 'success' })

      expect(sendSpy).toHaveBeenCalledWith({
        id: 'test-id',
        type: 'TEST_COMMAND_RESPONSE',
        payload: { result: 'success' },
        error: undefined,
        isResponse: true,
        from: bridge.instanceId,
        to: 'sender',
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
      const promise = bridge.request({ type: 'TEST_ACTION', payload: { query: 'test' } })

      vi.advanceTimersByTime(0)

      const sentMessage = sendSpy.mock.calls[0]?.[0]
      if (!sentMessage) {
        throw new Error('Message not sent')
      }
      bridge.reply(sentMessage.id, responsePayload)

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

    it('should reject message without id', () => {
      const errorHandler = vi.fn()
      bridge.onError(errorHandler)

      mockDriver.onMessage?.({ type: 'TEST', from: 'sender' } as any)

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error), expect.any(Object))
    })

    it('should reject message without type', () => {
      const errorHandler = vi.fn()
      bridge.onError(errorHandler)

      mockDriver.onMessage?.({ id: 'test-id', from: 'sender' } as any)

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
        id: 'test-id',
        type: 'TEST_COMMAND',
        from: 'sender',
      })

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
