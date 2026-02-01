import { describe, it, expect, vi } from 'vitest'
import mitt from 'mitt'
import MittDriver from '../../drivers/MittDriver'

describe('MittDriver', () => {
  it('should initialize and listen to message events', () => {
    const emitter = mitt() as any
    const driver = new MittDriver(emitter)

    const handler = vi.fn()
    driver.onMessage = handler

    emitter.emit('message', { id: 'test', type: 'test', from: 'sender' })

    expect(handler).toHaveBeenCalledWith({ id: 'test', type: 'test', from: 'sender' })
  })

  it('should send messages via emitter', () => {
    const emitter = mitt() as any
    const handler = vi.fn()
    emitter.on('message', handler)

    const driver = new MittDriver(emitter)
    driver.send({ id: 'test', type: 'test', from: 'sender' })

    expect(handler).toHaveBeenCalledWith({ id: 'test', type: 'test', from: 'sender' })
  })
})
