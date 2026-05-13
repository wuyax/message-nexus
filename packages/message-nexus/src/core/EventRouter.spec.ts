import { describe, it, expect } from 'vitest'
import { EventRouter } from './EventRouter'

describe('EventRouter validation', () => {
  const baseEnvelope = {
    from: 'sender',
    payload: {
      jsonrpc: '2.0',
      method: 'test'
    }
  }

  it('should validate correct request/notification', () => {
    expect(EventRouter.validateMessage(baseEnvelope)).toBe(true)
    expect(EventRouter.validateMessage({
        ...baseEnvelope,
        payload: { ...baseEnvelope.payload, id: 1 }
    })).toBe(true)
  })

  it('should validate correct response', () => {
    expect(EventRouter.validateMessage({
        from: 'sender',
        payload: {
            jsonrpc: '2.0',
            id: 1,
            result: 'ok'
        }
    })).toBe(true)
  })

  it('should validate correct error response', () => {
    expect(EventRouter.validateMessage({
        from: 'sender',
        payload: {
            jsonrpc: '2.0',
            id: 1,
            error: { code: -32600, message: 'Invalid Request' }
        }
    })).toBe(true)
  })

  it('should reject missing from', () => {
    expect(EventRouter.validateMessage({ ...baseEnvelope, from: undefined })).toBe(false)
    expect(EventRouter.validateMessage({ ...baseEnvelope, from: '' })).toBe(false)
  })

  it('should reject invalid payload format', () => {
    expect(EventRouter.validateMessage({ ...baseEnvelope, payload: null })).toBe(false)
    expect(EventRouter.validateMessage({ ...baseEnvelope, payload: [] })).toBe(false)
    expect(EventRouter.validateMessage({ ...baseEnvelope, payload: 'string' })).toBe(false)
  })

  it('should reject invalid jsonrpc version', () => {
    expect(EventRouter.validateMessage({
        ...baseEnvelope,
        payload: { ...baseEnvelope.payload, jsonrpc: '1.0' }
    })).toBe(false)
  })

  it('should reject response without ID', () => {
    expect(EventRouter.validateMessage({
        from: 'sender',
        payload: { jsonrpc: '2.0', result: 'ok' }
    })).toBe(false)
  })

  it('should reject message with both method and result', () => {
    expect(EventRouter.validateMessage({
        from: 'sender',
        payload: { jsonrpc: '2.0', method: 'test', result: 'ok', id: 1 }
    })).toBe(false)
  })

  it('should reject response with both result and error', () => {
    expect(EventRouter.validateMessage({
        from: 'sender',
        payload: { 
            jsonrpc: '2.0', 
            id: 1, 
            result: 'ok', 
            error: { code: 1, message: 'err' } 
        }
    })).toBe(false)
  })
})
