type LogLevel = 'info' | 'warn' | 'error';

function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  if (data) {
    entry.data = data;
  }
  const line = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  info(message: string, data?: Record<string, unknown>) {
    log('info', message, data);
  },
  warn(message: string, data?: Record<string, unknown>) {
    log('warn', message, data);
  },
  error(message: string, data?: Record<string, unknown>) {
    log('error', message, data);
  },
};
