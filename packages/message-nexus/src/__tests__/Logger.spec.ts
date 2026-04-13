import { describe, it, expect, vi } from 'vitest'
import MessageNexus, { LogLevel } from '../index'
import MittDriver from '../drivers/MittDriver'
import mitt from 'mitt'

describe('MessageNexus Logging', () => {
  it('should support adjustable log levels', () => {
    const emitter = mitt()
    const driver = new MittDriver(emitter as any)
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    // Case 1: Default level (INFO), logger enabled
    const nexusDefault = new MessageNexus(driver, { 
      loggerEnabled: true 
    })
    
    // @ts-ignore - access private logger for testing
    nexusDefault.logger.debug('test debug')
    // @ts-ignore
    nexusDefault.logger.info('test info')

    expect(debugSpy).not.toHaveBeenCalled()
    expect(infoSpy).toHaveBeenCalled()

    infoSpy.mockClear()

    // Case 2: Custom level (DEBUG), logger enabled
    const nexusDebug = new MessageNexus(driver, { 
      loggerEnabled: true,
      logLevel: LogLevel.DEBUG 
    })
    
    // @ts-ignore
    nexusDebug.logger.debug('test debug 2')
    
    expect(debugSpy).toHaveBeenCalled()
    
    debugSpy.mockRestore()
    infoSpy.mockRestore()
    nexusDefault.destroy()
    nexusDebug.destroy()
  })

  it('should support a simple custom logger', () => {
    const emitter = mitt()
    const driver = new MittDriver(emitter as any)
    
    const customLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }

    const nexus = new MessageNexus(driver, {
      logger: customLogger,
      loggerEnabled: true,
      logLevel: LogLevel.INFO
    })

    // Clear the "MessageNexus initialized" log
    customLogger.info.mockClear()

    // @ts-ignore
    nexus.logger.debug('test debug')
    // @ts-ignore
    nexus.logger.info('test info')
    // @ts-ignore
    nexus.logger.warn('test warn')
    // @ts-ignore
    nexus.logger.error('test error')

    expect(customLogger.debug).not.toHaveBeenCalled() // because minLevel is INFO
    expect(customLogger.info).toHaveBeenCalledWith('test info', undefined)
    expect(customLogger.warn).toHaveBeenCalledWith('test warn', undefined)
    expect(customLogger.error).toHaveBeenCalledWith('test error', undefined)

    nexus.destroy()
  })

  it('should support full LoggerInterface', () => {
    const emitter = mitt()
    const driver = new MittDriver(emitter as any)
    
    const fullLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      addHandler: vi.fn(),
      setMinLevel: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
      isEnabled: vi.fn().mockReturnValue(true)
    }

    const nexus = new MessageNexus(driver, {
      logger: fullLogger as any,
      loggerEnabled: true
    })

    // @ts-ignore
    expect(nexus.logger).toBe(fullLogger)
    expect(fullLogger.enable).toHaveBeenCalled()

    nexus.destroy()
  })
})
