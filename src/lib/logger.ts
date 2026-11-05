/* The one place the app writes to the console. Avoids console.* elsewhere and keeps personal data out of logs. */
type Fields = Record<string, unknown>;

export const logger = {
  error(message: string, fields?: Fields) { console.error(`[hrms] ${message}`, fields ?? ''); },
  warn(message: string, fields?: Fields) { console.warn(`[hrms] ${message}`, fields ?? ''); },
};
