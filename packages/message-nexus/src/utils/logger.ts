export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface LogEntry {
  level: LogLevel
  timestamp: number
  message: string
  metadata?: Record<string, unknown>
  context?: string
}

export type LogHandler = (entry: LogEntry) => void

export interface LoggerInterface {
  addHandler(handler: LogHandler): void
  setMinLevel(level: LogLevel): void
  enable(): void
  disable(): void
  isEnabled(): boolean
  debug(message: string, metadata?: Record<string, unknown>): void
  info(message: string, metadata?: Record<string, unknown>): void
  warn(message: string, metadata?: Record<string, unknown>): void
  error(message: string, metadata?: Record<string, unknown>): void
}

export function isLogger(value: unknown): value is LoggerInterface {
  if (value == null || typeof value !== 'object') return false

  const logger = value as LoggerInterface

  return (
    typeof logger.addHandler === 'function' &&
    typeof logger.setMinLevel === 'function' &&
    typeof logger.enable === 'function' &&
    typeof logger.disable === 'function' &&
    typeof logger.isEnabled === 'function' &&
    typeof logger.debug === 'function' &&
    typeof logger.info === 'function' &&
    typeof logger.warn === 'function' &&
    typeof logger.error === 'function'
  )
}

export class Logger implements LoggerInterface {
  private handlers: LogHandler[] = []
  private context: string
  private minLevel: LogLevel
  private enabled: boolean

  constructor(context: string, minLevel: LogLevel = LogLevel.INFO, enabled: boolean = false) {
    this.context = context
    this.minLevel = minLevel
    this.enabled = enabled
  }

  enable() {
    this.enabled = true
  }

  disable() {
    this.enabled = false
  }

  isEnabled(): boolean {
    return this.enabled
  }

  addHandler(handler: LogHandler) {
    this.handlers.push(handler)
  }

  setMinLevel(level: LogLevel) {
    this.minLevel = level
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]
    return levels.indexOf(level) >= levels.indexOf(this.minLevel)
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, unknown>) {
    if (!this.enabled || !this.shouldLog(level)) return

    const entry: LogEntry = {
      level,
      timestamp: Date.now(),
      message,
      metadata,
      context: this.context,
    }

    this.handlers.forEach((handler) => handler(entry))
  }

  debug(message: string, metadata?: Record<string, unknown>) {
    this.log(LogLevel.DEBUG, message, metadata)
  }

  info(message: string, metadata?: Record<string, unknown>) {
    this.log(LogLevel.INFO, message, metadata)
  }

  warn(message: string, metadata?: Record<string, unknown>) {
    this.log(LogLevel.WARN, message, metadata)
  }

  error(message: string, metadata?: Record<string, unknown>) {
    this.log(LogLevel.ERROR, message, metadata)
  }
}

function genTimestamp() {
  const now = new Date()
  return now.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  })
}

export const createConsoleHandler = (): LogHandler => {
  return (entry: LogEntry) => {
    const timestamp = genTimestamp()
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.context || 'app'}]`
    const logFn =
      entry.level === LogLevel.DEBUG
        ? console.debug
        : entry.level === LogLevel.INFO
          ? console.info
          : entry.level === LogLevel.WARN
            ? console.warn
            : console.error

    if (entry.metadata) {
      logFn(prefix, entry.message, entry.metadata)
    } else {
      logFn(prefix, entry.message)
    }
  }
}
