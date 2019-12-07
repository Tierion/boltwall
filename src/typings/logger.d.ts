type LoggerFunction = (...args: string[] | object[]) => void

export interface LoggerInterface {
  info: LoggerFunction
  error: LoggerFunction
  debug: LoggerFunction
  spam: LoggerFunction
}
