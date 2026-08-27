type LogLevel = "info" | "warn" | "error" | "debug";

interface LogContext {
  stage?: string;
  pipeline?: string;
  ipoId?: string;
  ipoName?: string;
  source?: string;
  operation?: string;
  durationMs?: number;
  [key: string]: unknown;
}

function formatLog(level: LogLevel, message: string, ctx?: LogContext): string {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  const contextStr = ctx ? ` ${JSON.stringify(ctx)}` : "";
  return `${prefix} ${message}${contextStr}`;
}

export const pipelineLog = {
  info(message: string, ctx?: LogContext) {
    console.log(formatLog("info", message, ctx));
  },
  warn(message: string, ctx?: LogContext) {
    console.warn(formatLog("warn", message, ctx));
  },
  error(message: string, ctx?: LogContext) {
    console.error(formatLog("error", message, ctx));
  },
  debug(message: string, ctx?: LogContext) {
    if (process.env.NODE_ENV !== "production" || process.env.DEBUG_PIPELINE) {
      console.log(formatLog("debug", message, ctx));
    }
  },
};

export function stageTimer(stage: string) {
  const started = Date.now();
  return {
    finish(extra?: Record<string, unknown>) {
      const durationMs = Date.now() - started;
      pipelineLog.info(`Stage "${stage}" completed`, { stage, durationMs, ...extra });
      return durationMs;
    },
    fail(error: unknown) {
      const durationMs = Date.now() - started;
      const msg = error instanceof Error ? error.message : String(error);
      pipelineLog.error(`Stage "${stage}" failed`, { stage, durationMs, error: msg });
      return durationMs;
    },
  };
}
