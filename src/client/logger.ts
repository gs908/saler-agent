import type { WeComBotConfig } from '../types';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private level: LogLevel;
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.levels[this.level] <= this.levels.debug) {
      console.log(`[DEBUG] ${new Date().toISOString()} ${message}`, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.levels[this.level] <= this.levels.info) {
      console.log(`[INFO] ${new Date().toISOString()} ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.levels[this.level] <= this.levels.warn) {
      console.warn(`[WARN] ${new Date().toISOString()} ${message}`, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.levels[this.level] <= this.levels.error) {
      console.error(`[ERROR] ${new Date().toISOString()} ${message}`, ...args);
    }
  }
}

let loggerInstance: Logger | null = null;

export function initLogger(config: Pick<WeComBotConfig, 'logLevel'>): Logger {
  loggerInstance = new Logger(config.logLevel);
  return loggerInstance;
}

export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger();
  }
  return loggerInstance;
}
