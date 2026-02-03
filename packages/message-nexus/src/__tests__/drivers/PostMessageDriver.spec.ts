import { describe, it, expect, vi, beforeEach } from 'vitest'
import PostMessageDriver from '../../drivers/PostMessageDriver'

describe('PostMessageDriver', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should initialize with targetOrigin and setup listener', () => {
    const mockWindow = {} as Window
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')

    const driver = new PostMessageDriver(mockWindow, 'https://example.com')

    expect(driver.targetWindow).toBe(mockWindow)
    expect(driver.targetOrigin).toBe('https://example.com')
    expect(addEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function))
  })

  it('should throw error when targetOrigin is "*"', () => {
    const mockWindow = {} as Window

    expect(() => new PostMessageDriver(mockWindow, '*')).toThrow(
      'PostMessageDriver requires explicit targetOrigin for security',
    )
  })

  it('should send messages using postMessage', () => {
    const mockWindow = {
      postMessage: vi.fn(),
    } as unknown as Window

    const driver = new PostMessageDriver(mockWindow, 'https://example.com')
    driver.send({ id: 'test', type: 'test', from: 'sender' })

    expect(mockWindow.postMessage).toHaveBeenCalledWith(
      { id: 'test', type: 'test', from: 'sender', __messageBridge: 'message-nexus-v1' },
      'https://example.com',
    )
  })

  it('should filter messages from different origins', () => {
    const handler = vi.fn()
    const mockWindow = {} as Window

    const driver = new PostMessageDriver(mockWindow, 'https://example.com')
    driver.onMessage = handler

    const mockEvent = new MessageEvent('message', {
      data: { id: 'test', type: 'test', from: 'sender' },
      origin: 'https://different.com',
    })

    window.dispatchEvent(mockEvent)

    expect(handler).not.toHaveBeenCalled()
  })

  it('should call onMessage for messages from matching origin', () => {
    const handler = vi.fn()
    const mockWindow = {} as Window

    const driver = new PostMessageDriver(mockWindow, 'https://example.com')
    driver.onMessage = handler

    const mockEvent = new MessageEvent('message', {
      data: { id: 'test', type: 'test', from: 'sender', __messageBridge: 'message-nexus-v1' },
      origin: 'https://example.com',
    })

    window.dispatchEvent(mockEvent)

    expect(handler).toHaveBeenCalledWith({ id: 'test', type: 'test', from: 'sender' })
  })

  it('should filter out non-MessageNexus messages', () => {
    const handler = vi.fn()
    const mockWindow = {} as Window

    const driver = new PostMessageDriver(mockWindow, 'https://example.com')
    driver.onMessage = handler

    const mockEvent = new MessageEvent('message', {
      data: { id: 'test', type: 'test', from: 'sender' },
      origin: 'https://example.com',
    })

    window.dispatchEvent(mockEvent)

    expect(handler).not.toHaveBeenCalled()
  })
})
