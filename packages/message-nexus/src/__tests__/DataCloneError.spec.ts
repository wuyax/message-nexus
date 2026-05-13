import { describe, it, expect, vi } from 'vitest'
import MessageNexus from '../index'
import BaseDriver from '../drivers/BaseDriver'
import { NexusError, NexusErrorCode } from '../errors'

describe('DataCloneError Handling in flushQueue', () => {
  class MockDriver extends BaseDriver {
    send = vi.fn()
  }

  it('should skip messages causing DataCloneError in flushQueue and continue processing', async () => {
    vi.useFakeTimers()
    const driver = new MockDriver()
    const nexus = new MessageNexus(driver, { loggerEnabled: false })
    
    // Create a DOMException that looks like a DataCloneError
    // In node/jsdom environment, DOMException is usually available
    const cloneError = new NexusError('Message payload cannot be cloned', NexusErrorCode.InvalidParams)
    const normalError = new Error('Network offline')
    
    // First, let's manually populate the queue with two messages
    // To do this, we make the first send fail with a normal error so it gets queued
    driver.send.mockImplementationOnce(() => { throw normalError })
    nexus.notify({ method: 'message1' })
    await vi.advanceTimersByTimeAsync(0)
    
    driver.send.mockImplementationOnce(() => { throw normalError })
    nexus.notify({ method: 'message2' })
    await vi.advanceTimersByTimeAsync(0)
    
    expect(nexus.getMetrics().queuedMessages).toBe(2)
    
    // Now we want to test flushQueue. 
    // We want the first message to fail with DataCloneError (should be dropped)
    // and the second to succeed.
    driver.send.mockImplementationOnce(() => { throw cloneError }) // for message1
               .mockImplementationOnce(() => {}) // for message2
               
    nexus.flushQueue()
    
    // message1 should be dropped due to DataCloneError
    // message2 should be sent successfully
    expect(nexus.getMetrics().queuedMessages).toBe(0)
    
    // driver.send should have been called 4 times total:
    // 2 times during initial notify (both failed)
    // 2 times during flushQueue (one failed with DataCloneError, one succeeded)
    expect(driver.send).toHaveBeenCalledTimes(4)
  })

  it('should stop flushQueue on non-DataCloneError and keep message in queue', async () => {
    vi.useFakeTimers()
    const driver = new MockDriver()
    const nexus = new MessageNexus(driver, { loggerEnabled: false })
    
    const normalError = new Error('Still offline')
    
    // Populate queue
    driver.send.mockImplementationOnce(() => { throw normalError })
    nexus.notify({ method: 'message1' })
    await vi.advanceTimersByTimeAsync(0)
    
    driver.send.mockImplementationOnce(() => { throw normalError })
    nexus.notify({ method: 'message2' })
    await vi.advanceTimersByTimeAsync(0)
    
    expect(nexus.getMetrics().queuedMessages).toBe(2)
    
    // During flush, if it hits a normal error, it should stop and keep messages
    driver.send.mockImplementation(() => { throw normalError })
    
    nexus.flushQueue()
    
    // Should still have 2 messages in queue because it broke on the first one
    expect(nexus.getMetrics().queuedMessages).toBe(2)
    expect(driver.send).toHaveBeenCalledTimes(3) // 2 from notify, 1 from flush attempt
  })
})
