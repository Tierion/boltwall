type LoggerFunction = (...args: string[] | object[]) => void

export interface LoggerInterface {
  info: LoggerFunction
  error: LoggerFunction
  warning: LoggerFunction
  debug: LoggerFunction
  spam: LoggerFunction
}
