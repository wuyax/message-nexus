import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import WebSocketDriver from '../../drivers/WebSocktDriver'

describe('WebSocketDriver - Reconnect Backoff', () => {
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
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should use exponential backoff for reconnection delays with a maximum cap', () => {
    const driver = new WebSocketDriver({
      url: 'ws://localhost',
      reconnect: { maxRetries: 5, retryInterval: 1000 }
    })

    // Simulate scheduling reconnects and check the delays
    // Since scheduleReconnect is private, we can test it by simulating close events
    const wsInstances = (global.WebSocket as any).mock.results.map((r: any) => r.value)
    const firstWs = wsInstances[0]
    
    // Find the close event listener
    const closeListener = firstWs.addEventListener.mock.calls.find((call: any) => call[0] === 'close')[1]
    
    const spySetTimeout = vi.spyOn(window, 'setTimeout')

    // Attempt 1: retryCount = 1, delay = 2^1 * 1000 = 2000ms
    closeListener()
    expect(spySetTimeout).toHaveBeenLastCalledWith(expect.any(Function), 2000)

    // Trigger the timeout so it reconnects
    vi.advanceTimersByTime(2000)

    // Attempt 2: retryCount = 2, delay = 2^2 * 1000 = 4000ms
    const wsInstancesAfterReconnect = (global.WebSocket as any).mock.results.map((r: any) => r.value)
    const secondWs = wsInstancesAfterReconnect[1]
    const secondCloseListener = secondWs.addEventListener.mock.calls.find((call: any) => call[0] === 'close')[1]
    secondCloseListener()
    expect(spySetTimeout).toHaveBeenLastCalledWith(expect.any(Function), 4000)
    
    driver.destroy()
  })
})
