import { describe, it, expect, vi } from 'vitest'
import mitt from 'mitt'
import BaseDriver from '../../drivers/BaseDriver'
import MittDriver from '../../drivers/MittDriver'

describe('MittDriver', () => {
  it('should initialize with emitter', () => {
    const emitter = mitt<Record<string, any>>()
    const driver = new MittDriver(emitter as any)

    expect(driver).toBeInstanceOf(BaseDriver)
  })

  it('should send messages via emitter', () => {
    const emitter = mitt<Record<string, any>>()

    const emitSpy = vi.spyOn(emitter, 'emit')
    const driver = new MittDriver(emitter as any)
    driver.send({ id: 'test', type: 'test', from: 'sender' })

    expect(emitSpy).toHaveBeenCalled()
    expect(emitSpy).toHaveBeenCalledWith(expect.any(String), {
      id: 'test',
      type: 'test',
      from: 'sender',
    })
  })
})
