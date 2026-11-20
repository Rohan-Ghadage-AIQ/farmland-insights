import { env } from './env';

type LogMethod = (message: string, ...context: unknown[]) => void;

export interface Logger {
  readonly debug: LogMethod;
  readonly info: LogMethod;
  readonly warn: LogMethod;
  readonly error: LogMethod;
}

const noop: LogMethod = () => undefined;

/**
 * Thin console wrapper so `console.*` appears nowhere else in src/ (enforced by ESLint).
 * Callers must never pass tokens, passwords or full request bodies as context.
 */
export function createLogger({ enabled }: { readonly enabled: boolean }): Logger {
  if (!enabled) {
    return { debug: noop, info: noop, warn: noop, error: noop };
  }
  return {
    debug: (message, ...context) => {
      console.debug(message, ...context);
    },
    info: (message, ...context) => {
      console.info(message, ...context);
    },
    warn: (message, ...context) => {
      console.warn(message, ...context);
    },
    error: (message, ...context) => {
      console.error(message, ...context);
    },
  };
}

/** No-op in production builds. */
export const logger: Logger = createLogger({ enabled: !env.isProd });
