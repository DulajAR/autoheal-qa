
export type LogLevel =
  | "DEBUG"
  | "INFO"
  | "WARN"
  | "ERROR";

type LogContext = Record<
  string,
  string | number | boolean | null
>;

export class Logger {
  private static write(
    level: LogLevel,
    message: string,
    context: LogContext = {}
  ): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };

    const output = JSON.stringify(entry);

    if (level === "ERROR") {
      console.error(output);
    } else if (level === "WARN") {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  static debug(
    message: string,
    context?: LogContext
  ): void {
    this.write("DEBUG", message, context);
  }

  static info(
    message: string,
    context?: LogContext
  ): void {
    this.write("INFO", message, context);
  }

  static warn(
    message: string,
    context?: LogContext
  ): void {
    this.write("WARN", message, context);
  }

  static error(
    message: string,
    context?: LogContext
  ): void {
    this.write("ERROR", message, context);
  }
}
