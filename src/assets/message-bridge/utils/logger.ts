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

export class Logger {
  private handlers: LogHandler[] = []
  private context: string
  private minLevel: LogLevel

  constructor(context: string, minLevel: LogLevel = LogLevel.INFO) {
    this.context = context
    this.minLevel = minLevel
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
    if (!this.shouldLog(level)) return

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

export const createConsoleHandler = (): LogHandler => {
  return (entry: LogEntry) => {
    const timestamp = new Date(entry.timestamp).toISOString()
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
