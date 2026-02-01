import { describe, it, expect, beforeEach, vi } from 'vitest'
import BaseDriver from '../../drivers/BaseDriver'

describe('BaseDriver', () => {
  it('should initialize with onMessage as null', () => {
    const driver = new BaseDriver()
    expect(driver.onMessage).toBeNull()
  })

  it('should throw error when send is called directly', () => {
    const driver = new BaseDriver()
    expect(() => driver.send({ id: 'test', type: 'test', from: 'test' })).toThrow('Not implemented')
  })
})
