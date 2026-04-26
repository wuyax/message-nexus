import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import WebSocketDriver from '../../drivers/WebSocktDriver'

describe('WebSocketDriver', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Mock global WebSocket
    global.WebSocket = vi.fn(function () {
      return {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        close: vi.fn(),
        send: vi.fn(),
        readyState: 1 // OPEN
      }
    }) as any
    ;(global.WebSocket as any).OPEN = 1
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const getWsInstance = (index = 0) => (global.WebSocket as any).mock.results[index].value
  const getListeners = (ws: any, event: string) => 
    ws.addEventListener.mock.calls.filter((call: any) => call[0] === event).map((call: any) => call[1])

  it('should use exponential backoff for reconnection delays with a maximum cap', () => {
    const driver = new WebSocketDriver({
      url: 'ws://localhost',
      reconnect: { maxRetries: 5, retryInterval: 1000 }
    })

    const firstWs = getWsInstance(0)
    const closeListener = getListeners(firstWs, 'close')[0]
    
    const spySetTimeout = vi.spyOn(window, 'setTimeout')

    // Attempt 1: retryCount = 1, delay = 2^1 * 1000 = 2000ms
    closeListener()
    expect(spySetTimeout).toHaveBeenLastCalledWith(expect.any(Function), 2000)

    // Trigger the timeout so it reconnects
    vi.advanceTimersByTime(2000)

    // Attempt 2: retryCount = 2, delay = 2^2 * 1000 = 4000ms
    const secondWs = getWsInstance(1)
    const secondCloseListener = getListeners(secondWs, 'close')[0]
    secondCloseListener()
    expect(spySetTimeout).toHaveBeenLastCalledWith(expect.any(Function), 4000)
    
    driver.destroy()
  })

  it('should trigger onConnect and status change on open', () => {
    const onStatusChange = vi.fn()
    const driver = new WebSocketDriver({
      url: 'ws://localhost',
      onStatusChange
    })
    const onConnect = vi.fn()
    driver.onConnect = onConnect

    const ws = getWsInstance()
    const openListeners = getListeners(ws, 'open')
    
    expect(onStatusChange).toHaveBeenCalledWith('connecting')

    openListeners.forEach((listener: any) => listener())

    expect(onConnect).toHaveBeenCalled()
    expect(onStatusChange).toHaveBeenCalledWith('connected')
    expect(driver['retryCount']).toBe(0)
  })

  it('should handle incoming messages correctly', () => {
    const driver = new WebSocketDriver({ url: 'ws://localhost' })
    const onMessage = vi.fn()
    driver.onMessage = onMessage

    const ws = getWsInstance()
    const msgListeners = getListeners(ws, 'message')
    const listener = msgListeners[0]

    // Invalid JSON
    listener({ data: 'invalid json' }) // Should catch and log error internally

    // Valid JSON but not our protocol
    listener({ data: JSON.stringify({ some: 'data' }) })
    expect(onMessage).not.toHaveBeenCalled()

    // Valid JSON and our protocol
    listener({ data: JSON.stringify({ __messageBridge: 'message-nexus-v1', payload: 'test' }) })
    expect(onMessage).toHaveBeenCalledWith({ payload: 'test' })
  })

  it('should handle error events', () => {
    const onStatusChange = vi.fn()
    const driver = new WebSocketDriver({ url: 'ws://localhost', onStatusChange })
    
    const ws = getWsInstance()
    const errListeners = getListeners(ws, 'error')
    
    errListeners[0](new Error('test err'))
    
    expect(onStatusChange).toHaveBeenCalledWith('error')
  })

  it('should handle close event and not reconnect if maxRetries reached or reconnect disabled', () => {
    const onStatusChange = vi.fn()
    const driver = new WebSocketDriver({ 
      url: 'ws://localhost', 
      reconnect: false,
      onStatusChange 
    })
    const onDisconnect = vi.fn()
    driver.onDisconnect = onDisconnect

    const ws = getWsInstance()
    const closeListeners = getListeners(ws, 'close')
    
    closeListeners[0]()

    expect(onStatusChange).toHaveBeenCalledWith('disconnected')
    expect(onDisconnect).toHaveBeenCalled()
  })

  it('should send valid messages', () => {
    const driver = new WebSocketDriver({ url: 'ws://localhost' })
    const ws = getWsInstance()
    ws.readyState = 1 // OPEN
    
    driver.send({ from: 'a', payload: 'test' } as any)
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
      from: 'a',
      payload: 'test',
      __messageBridge: 'message-nexus-v1'
    }))
  })

  it('should throw error when sending message if ws is not open', () => {
    const driver = new WebSocketDriver({ url: 'ws://localhost' })
    const ws = getWsInstance()
    ws.readyState = 3 // CLOSED
    
    expect(() => driver.send({ from: 'a', payload: 'test' } as any)).toThrow('WebSocket is not open')

    // Or if ws is null
    driver['ws'] = null
    expect(() => driver.send({ from: 'a', payload: 'test' } as any)).toThrow('WebSocket is not open')
  })

  it('should close and destroy properly', () => {
    const onStatusChange = vi.fn()
    const driver = new WebSocketDriver({ url: 'ws://localhost', onStatusChange })
    const ws = getWsInstance()
    
    driver['reconnectTimer'] = 123 as any

    driver.destroy()

    expect(ws.close).toHaveBeenCalled()
    expect(driver['ws']).toBeNull()
    expect(driver['reconnectTimer']).toBeNull()
    expect(driver.onMessage).toBeNull()
    expect(driver.onConnect).toBeNull()
    expect(driver.onDisconnect).toBeNull()
    expect(onStatusChange).toHaveBeenCalledWith('disconnected')
  })

  it('should close cleanly without reconnectTimer and ws', () => {
    const driver = new WebSocketDriver({ url: 'ws://localhost' })
    driver['reconnectTimer'] = null
    driver['ws'] = null
    
    driver.close()
    
    expect(driver['ws']).toBeNull()
    expect(driver['reconnectTimer']).toBeNull()
  })
})
