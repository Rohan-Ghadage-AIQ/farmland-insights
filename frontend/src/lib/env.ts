import { z } from 'zod';

/** Thrown when the build-time environment is missing or malformed. Fails loudly at startup. */
export class EnvError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}\n` +
        'Check frontend/.env against frontend/.env.example.',
    );
    this.name = 'EnvError';
    this.issues = issues;
  }
}

const DEFAULT_TOKEN_TTL_MINUTES = '480';

const httpUrl = (name: string) =>
  z.url({ protocol: /^https?$/, error: `${name} must be an absolute http(s) URL` });

const schema = z.object({
  VITE_ENABLE_DEV_TOKEN_LOGIN: z
    .enum(['true', 'false'], { error: 'VITE_ENABLE_DEV_TOKEN_LOGIN must be "true" or "false"' })
    .default('false'),
  VITE_TOKEN_TTL_MINUTES: z
    .string()
    .regex(/^[1-9]\d*$/, { error: 'VITE_TOKEN_TTL_MINUTES must be a whole number of minutes > 0' })
    .default(DEFAULT_TOKEN_TTL_MINUTES),
  VITE_MAP_STYLE_URL: httpUrl('VITE_MAP_STYLE_URL').optional(),
  VITE_MAP_STYLE_SATELLITE_URL: httpUrl('VITE_MAP_STYLE_SATELLITE_URL').optional(),
  VITE_MAP_API_KEY: z.string().optional(),
  DEV: z.boolean().default(false),
  PROD: z.boolean().default(false),
});

export interface Env {
  /** Show the passwordless dev "Get token" sign-in. Never a real sign-in. */
  readonly enableDevTokenLogin: boolean;
  /** Requested token lifetime. */
  readonly tokenTtlMinutes: number;
  readonly mapStyleUrl: string | undefined;
  readonly mapStyleSatelliteUrl: string | undefined;
  readonly mapApiKey: string | undefined;
  readonly isDev: boolean;
  readonly isProd: boolean;
}

/** Empty strings (as written in .env.example) mean "not configured". */
function normalise(raw: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(raw)
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value] as const)
      .filter(([, value]) => value !== ''),
  );
}

/**
 * Validates raw `import.meta.env`-style values and returns typed configuration.
 * Error messages name the offending variable but never echo its value, because
 * `VITE_MAP_API_KEY` is a secret-ish value.
 *
 * @throws {EnvError} listing every invalid variable.
 */
export function parseEnv(raw: Readonly<Record<string, unknown>>): Env {
  const result = schema.safeParse(normalise(raw));
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => {
        const path = issue.path.map(String).join('.');
        return path === '' || issue.message.startsWith(path)
          ? issue.message
          : `${path}: ${issue.message}`;
      }),
    );
  }

  const data = result.data;
  return {
    enableDevTokenLogin: data.VITE_ENABLE_DEV_TOKEN_LOGIN === 'true',
    tokenTtlMinutes: Number(data.VITE_TOKEN_TTL_MINUTES),
    mapStyleUrl: data.VITE_MAP_STYLE_URL,
    mapStyleSatelliteUrl: data.VITE_MAP_STYLE_SATELLITE_URL,
    mapApiKey: data.VITE_MAP_API_KEY,
    isDev: data.DEV,
    isProd: data.PROD,
  };
}

/** The validated configuration. Reading env anywhere else in src/ is a lint-worthy smell. */
export const env: Env = parseEnv(import.meta.env);
