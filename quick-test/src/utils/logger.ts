type LogLevel = "info" | "warn" | "error" | "debug";

/**
 * Get the timestamp
 * @returns The timestamp
 */
function timestamp(): string {
    return new Date().toISOString();
}

/**
 * Format the log message
 * @param level - The log level
 * @param tag - The tag
 * @param message - The message
 * @param meta - The metadata
 * @returns The formatted log message
 */
function format(level: LogLevel, tag: string, message: string, meta?: Record<string, unknown>): string {
    const base = `[${timestamp()}] [${level.toUpperCase()}] [${tag}] ${message}`;
    if (!meta || Object.keys(meta).length === 0) return base;
    return `${base} ${JSON.stringify(meta)}`;
}

/**
 * The logger
 */
export const log = {
    info(tag: string, message: string, meta?: Record<string, unknown>): void {
        console.log(format("info", tag, message, meta));
    },
    warn(tag: string, message: string, meta?: Record<string, unknown>): void {
        console.warn(format("warn", tag, message, meta));
    },
    error(tag: string, message: string, meta?: Record<string, unknown>): void {
        console.error(format("error", tag, message, meta));
    },
    debug(tag: string, message: string, meta?: Record<string, unknown>): void {
        if (process.env.LOG_LEVEL === "debug") {
            console.log(format("debug", tag, message, meta));
        }
    },
};
